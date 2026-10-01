import { router, type Href, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Brand } from "@/components/brand";
import { PrimaryButton } from "@/components/primary-button";
import { colors } from "@/constants/colors";
import { formatGymDate } from "@/lib/staff-data";
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

type LifecycleAction = "freeze" | "resume" | "cancel";

interface MembershipRow {
  id: string;
  member_id: string;
  plan_name: string;
  enrollment_code: string;
  status: "active" | "scheduled" | "frozen" | "expired" | "cancelled";
  start_date: string;
  end_date: string;
}

export default function StaffManageMembershipScreen() {
  const { membershipId, memberId, memberRecordId } = useLocalSearchParams<{
    membershipId: string;
    memberId: string;
    memberRecordId: string;
  }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);

  const load = useCallback(async () => {
    if (!workspace?.canManageMemberships) {
      setError("Your role cannot manage memberships in this workspace.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await supabase
        .from("member_membership_statuses")
        .select(
          "id, member_id, plan_name, enrollment_code, status, start_date, end_date",
        )
        .eq("organization_id", workspace.organization.id)
        .eq("member_id", memberId)
        .eq("id", memberRecordId)
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) throw new Error("This membership is not in your branch scope.");
      setMembership(result.data as MembershipRow);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The membership could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [memberId, memberRecordId, workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  const complete = (outcome: "frozen" | "resumed" | "cancelled") => {
    if (!workspace) return;
    router.replace(
      `/staff/${workspace.membershipId}/members/${memberId}?lifecycle=${outcome}` as Href,
    );
  };

  const runAction = async (action: LifecycleAction) => {
    if (!workspace || !membership) return;

    const cleanReason = reason.trim();
    if (action === "cancel" && (cleanReason.length < 2 || cleanReason.length > 500)) {
      setMessage("Enter a cancellation reason between 2 and 500 characters.");
      return;
    }
    if (action === "freeze" && cleanReason.length === 1) {
      setMessage("Enter at least 2 characters for a freeze reason, or leave it blank.");
      return;
    }

    setPendingAction(action);
    setMessage(null);

    try {
      const request =
        action === "freeze"
          ? supabase.rpc("freeze_membership", {
              p_organization_id: workspace.organization.id,
              p_membership_id: membership.id,
              p_effective_date: null,
              p_reason: cleanReason || null,
            })
          : action === "resume"
            ? supabase.rpc("resume_membership", {
                p_organization_id: workspace.organization.id,
                p_membership_id: membership.id,
                p_effective_date: null,
              })
            : supabase.rpc("cancel_membership", {
                p_organization_id: workspace.organization.id,
                p_membership_id: membership.id,
                p_effective_date: null,
                p_reason: cleanReason,
              });

      const { error: actionError } = await request;
      if (actionError) throw actionError;

      complete(
        action === "freeze"
          ? "frozen"
          : action === "resume"
            ? "resumed"
            : "cancelled",
      );
    } catch (cause) {
      const actionError = cause as { code?: string; message?: string };
      if (actionError.code === "23P01") {
        setMessage("This change would overlap another membership.");
      } else if (actionError.code === "42501") {
        setMessage(`Your role cannot ${action} this membership.`);
      } else if (["22023", "23503", "23514"].includes(actionError.code ?? "")) {
        setMessage(`This membership cannot be ${action}d in its current state.`);
      } else {
        setMessage(actionError.message ?? `The membership could not be ${action}d.`);
      }
    } finally {
      setPendingAction(null);
    }
  };

  const confirmCancellation = () => {
    Alert.alert(
      "Cancel this membership?",
      "The membership will stop being valid immediately. This action remains in the audit history.",
      [
        { text: "Keep membership", style: "cancel" },
        {
          text: "Cancel membership",
          style: "destructive",
          onPress: () => void runAction("cancel"),
        },
      ],
    );
  };

  if (!workspace) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Workspace unavailable</Text>
          <PrimaryButton label="Back" onPress={() => router.replace("/")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Brand compact />
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>Cancel</Text>
          </Pressable>
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>OWNER / STAFF · LIFECYCLE</Text>
          <Text style={styles.title}>Manage membership</Text>
        </View>

        {message && (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.stateText}>Loading membership…</Text>
          </View>
        ) : error || !membership ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Membership unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void load()} />
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.summary}>
              <Text style={styles.planName}>{membership.plan_name}</Text>
              <Text style={styles.code}>{membership.enrollment_code}</Text>
              <Text style={styles.dates}>
                {formatGymDate(membership.start_date)} – {formatGymDate(membership.end_date)}
              </Text>
              <Text style={styles.status}>{membership.status}</Text>
            </View>

            {["active", "scheduled", "frozen"].includes(membership.status) && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>REASON</Text>
                <TextInput
                  multiline
                  onChangeText={setReason}
                  placeholder={
                    membership.status === "active"
                      ? "Optional for freeze; required for cancellation"
                      : "Required for cancellation"
                  }
                  placeholderTextColor={colors.inkMuted}
                  style={styles.input}
                  value={reason}
                />
              </View>
            )}

            {membership.status === "active" && (
              <PrimaryButton
                label="Freeze membership"
                loading={pendingAction === "freeze"}
                onPress={() => void runAction("freeze")}
                tone="secondary"
              />
            )}
            {membership.status === "frozen" && (
              <PrimaryButton
                label="Resume membership"
                loading={pendingAction === "resume"}
                onPress={() => void runAction("resume")}
              />
            )}
            {["active", "scheduled", "frozen"].includes(membership.status) && (
              <PrimaryButton
                label="Cancel membership"
                loading={pendingAction === "cancel"}
                onPress={confirmCancellation}
                tone="danger"
              />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { alignSelf: "center", maxWidth: 620, padding: 22, paddingBottom: 44, width: "100%" },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  backText: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  heading: { marginBottom: 24, marginTop: 40 },
  eyebrow: { color: colors.accentDark, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 7 },
  messageCard: { backgroundColor: colors.dangerSoft, borderRadius: 14, marginBottom: 14, padding: 14 },
  messageText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 22, borderWidth: 1, gap: 15, padding: 20 },
  summary: { backgroundColor: colors.surfaceMuted, borderRadius: 15, padding: 16 },
  planName: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  code: { color: colors.accentDark, fontSize: 11, fontWeight: "800", marginTop: 4 },
  dates: { color: colors.inkMuted, fontSize: 13, marginTop: 10 },
  status: { color: colors.accentDark, fontSize: 10, fontWeight: "900", marginTop: 8, textTransform: "uppercase" },
  fieldGroup: { gap: 7 },
  label: { color: colors.inkMuted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  input: { backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 13, borderWidth: 1, color: colors.ink, fontSize: 14, minHeight: 100, padding: 13, textAlignVertical: "top" },
  centerState: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, gap: 14, padding: 28 },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  errorTitle: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  stateText: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
