import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { Brand } from "@/components/brand";
import { PrimaryButton } from "@/components/primary-button";
import { colors } from "@/constants/colors";
import {
  formatGymDateTime,
  loadMyMemberProfile,
  type MemberProfile,
} from "@/lib/member-data";
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

interface MemberPass {
  id: string;
  token: string;
  createdAt: string;
}

interface MemberPassRow {
  id: string;
  token: string;
  created_at: string;
}

export default function MemberPassScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [pass, setPass] = useState<MemberPass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRotating, setIsRotating] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspace?.hasMemberMode) {
      setError("This member workspace is no longer available.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const memberProfile = await loadMyMemberProfile(workspace.organization.id);
      if (!memberProfile) {
        throw new Error("Your account is not linked to a member record yet.");
      }

      const passResult = await supabase
        .from("member_qr_passes")
        .select("id, token, created_at")
        .eq("organization_id", workspace.organization.id)
        .eq("member_id", memberProfile.id)
        .eq("active", true)
        .maybeSingle();

      if (passResult.error) throw passResult.error;

      const passRow = passResult.data as MemberPassRow | null;
      setMember(memberProfile);
      setPass(
        passRow
          ? {
              id: passRow.id,
              token: passRow.token,
              createdAt: passRow.created_at,
            }
          : null,
      );
    } catch (cause) {
      console.error("Member QR pass could not be loaded", cause);
      setError(
        cause instanceof Error ? cause.message : "Your QR pass could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  const rotatePass = async () => {
    if (!workspace || !member) return;

    setIsRotating(true);
    setMessage(null);

    try {
      const { error: rotationError } = await supabase.rpc(
        "rotate_member_qr_pass",
        {
          p_organization_id: workspace.organization.id,
          p_member_id: member.id,
        },
      );

      if (rotationError) throw rotationError;

      setMessage(
        pass
          ? "Your old pass was revoked and a new pass is ready."
          : "Your QR pass is ready.",
      );
      await refresh();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "A new QR pass could not be created.",
      );
    } finally {
      setIsRotating(false);
    }
  };

  const confirmRotation = () => {
    if (!pass) {
      void rotatePass();
      return;
    }

    Alert.alert(
      "Replace your QR pass?",
      "Your current pass will stop working immediately.",
      [
        { text: "Keep current pass", style: "cancel" },
        {
          text: "Replace pass",
          style: "destructive",
          onPress: () => void rotatePass(),
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

  const branch = workspace.branches.find(
    (candidate) => candidate.id === member?.homeBranchId,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Brand compact />
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>MEMBER · DIGITAL PASS</Text>
          <Text style={styles.title}>Your GymGrid pass</Text>
          <Text style={styles.subtitle}>
            Present this code at reception or for a booked class check-in.
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
            <Text style={styles.stateText}>Loading your pass…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Pass unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void refresh()} />
          </View>
        ) : (
          <View style={styles.passCard}>
            <View style={styles.memberBlock}>
              <Text style={styles.memberName}>
                {member?.preferredName || member?.fullName || "Gym member"}
              </Text>
              <Text style={styles.memberMeta}>
                {member?.memberCode} · {branch?.name ?? "Assigned branch"}
              </Text>
            </View>

            {pass ? (
              <>
                <View style={styles.qrFrame}>
                  <QRCode
                    backgroundColor={colors.surface}
                    color={colors.ink}
                    ecl="M"
                    quietZone={14}
                    size={230}
                    value={`gymgrid:member:${pass.token}`}
                  />
                </View>
                <Text style={styles.issuedText}>
                  Issued {formatGymDateTime(pass.createdAt, workspace.organization.timezone)}
                </Text>
              </>
            ) : (
              <View style={styles.noPass}>
                <Text style={styles.stateTitle}>No active pass</Text>
                <Text style={styles.stateText}>
                  Create a personal QR pass for faster gym and class check-in.
                </Text>
              </View>
            )}

            <PrimaryButton
              label={pass ? "Replace QR pass" : "Create QR pass"}
              loading={isRotating}
              onPress={confirmRotation}
              tone={pass ? "secondary" : "primary"}
            />

            <Text style={styles.securityNote}>
              Keep this pass private. Replacing it immediately revokes the previous code.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: {
    alignSelf: "center",
    maxWidth: 620,
    padding: 22,
    width: "100%",
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  backText: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  heading: { marginBottom: 24, marginTop: 40 },
  eyebrow: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 8,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  messageCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    marginBottom: 16,
    padding: 14,
  },
  messageText: { color: colors.accentDeep, fontSize: 14, fontWeight: "700" },
  centerState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 28,
  },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  errorTitle: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  stateText: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  passCard: {
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 26,
    borderWidth: 1,
    padding: 22,
  },
  memberBlock: { alignItems: "center", marginBottom: 20 },
  memberName: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  memberMeta: { color: colors.inkMuted, fontSize: 13, marginTop: 5 },
  qrFrame: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
  },
  issuedText: {
    color: colors.inkMuted,
    fontSize: 12,
    marginBottom: 20,
    marginTop: 12,
    textAlign: "center",
  },
  noPass: { alignItems: "center", gap: 8, marginBottom: 22, padding: 28 },
  securityNote: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
    textAlign: "center",
  },
});
