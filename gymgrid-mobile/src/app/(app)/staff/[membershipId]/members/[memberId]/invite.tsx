import { router, type Href, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { loadStaffMember, type StaffMember } from "@/lib/staff-data";
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

interface InvitationResult {
  invitation_id: string;
  invitation_email: string;
}

export default function StaffInviteMemberScreen() {
  const { membershipId, memberId } = useLocalSearchParams<{
    membershipId: string;
    memberId: string;
  }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [member, setMember] = useState<StaffMember | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!workspace?.canManageMembers) {
      setError("Your role cannot invite members in this workspace.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const memberProfile = await loadStaffMember(
        workspace.organization.id,
        memberId,
      );
      if (!memberProfile || memberProfile.status !== "active") {
        throw new Error("This member is not active in your branch scope.");
      }
      if (memberProfile.authUserId) {
        throw new Error("This member already has a linked app account.");
      }

      setMember(memberProfile);
      setEmail((current) => current || memberProfile.email || "");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The member app invitation could not be prepared.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [memberId, setEmail, setMember, workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  const createInvitation = async () => {
    if (!workspace || !member) return;

    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setMessage("Enter the email the member will use to sign in.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const { data, error: invitationError } = await supabase.rpc(
        "create_member_invitation",
        {
          p_organization_id: workspace.organization.id,
          p_member_id: member.id,
          p_email: cleanEmail,
        },
      );

      if (invitationError) throw invitationError;
      const result = (data as InvitationResult[] | null)?.[0];
      router.replace(
        `/staff/${workspace.membershipId}/members/${member.id}?invited=${encodeURIComponent(result?.invitation_email ?? cleanEmail)}` as Href,
      );
    } catch (cause) {
      const invitationError = cause as { code?: string; message?: string };
      if (invitationError.code === "42501") {
        setMessage("Your role cannot invite this member.");
      } else if (invitationError.code === "23505") {
        setMessage("This member or email is already linked to an app account.");
      } else if (invitationError.code === "22023") {
        setMessage("The member or email is unavailable.");
      } else {
        setMessage(
          invitationError.message ?? "The member invitation could not be created.",
        );
      }
    } finally {
      setIsSaving(false);
    }
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
          <Text style={styles.eyebrow}>OWNER / STAFF · APP ACCESS</Text>
          <Text style={styles.title}>Invite member</Text>
          <Text style={styles.subtitle}>
            Link one sign-in account to this exact member and home branch.
          </Text>
        </View>

        {message && (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.stateText}>Loading member access…</Text>
          </View>
        ) : error || !member ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Invitation unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void load()} />
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.memberCard}>
              <Text style={styles.memberName}>{member.fullName}</Text>
              <Text style={styles.memberCode}>{member.memberCode}</Text>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>MEMBER SIGN-IN EMAIL *</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="member@example.com"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
                value={email}
              />
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>How activation works</Text>
              <Text style={styles.infoText}>
                The invitation expires after seven days. When this email signs in, GymGrid accepts the invitation, grants only the member role for this branch, and links the account atomically.
              </Text>
            </View>
            <PrimaryButton
              label="Create app invitation"
              loading={isSaving}
              onPress={() => void createInvitation()}
            />
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
  subtitle: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 9 },
  messageCard: { backgroundColor: colors.dangerSoft, borderRadius: 14, marginBottom: 14, padding: 14 },
  messageText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 22, borderWidth: 1, gap: 18, padding: 20 },
  memberCard: { backgroundColor: colors.surfaceMuted, borderRadius: 15, padding: 16 },
  memberName: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  memberCode: { color: colors.accentDark, fontSize: 11, fontWeight: "800", marginTop: 4 },
  fieldGroup: { gap: 7 },
  label: { color: colors.inkMuted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  input: { backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 13, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 50, paddingHorizontal: 14 },
  infoCard: { backgroundColor: colors.accentSoft, borderRadius: 14, padding: 15 },
  infoTitle: { color: colors.accentDeep, fontSize: 13, fontWeight: "900" },
  infoText: { color: colors.accentDeep, fontSize: 12, lineHeight: 19, marginTop: 5 },
  centerState: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, gap: 14, padding: 28 },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  errorTitle: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  stateText: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
