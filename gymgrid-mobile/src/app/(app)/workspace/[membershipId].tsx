import type { TenantRole } from "@gymgrid/domain";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Brand } from "@/components/brand";
import { PrimaryButton } from "@/components/primary-button";
import { colors } from "@/constants/colors";
import { useWorkspaces } from "@/providers/workspace-provider";

const roleLabels: Record<TenantRole, string> = {
  gym_owner: "Gym owner",
  gym_manager: "Gym manager",
  receptionist: "Receptionist",
  trainer: "Trainer",
  accountant: "Accountant",
  member: "Member",
};

const staffActions = [
  {
    title: "Members & plans",
    description: "Find members, review access, and update plan details.",
  },
  {
    title: "Enrol a member",
    description: "Create a member and assign their first membership.",
  },
  {
    title: "Collections",
    description: "Record and review manual membership payments.",
  },
  {
    title: "Classes & bookings",
    description: "Manage sessions, rosters, waitlists, and attendance.",
  },
];

const memberActions = [
  {
    key: "classes",
    title: "My class bookings",
    description: "Book a session, view your place, or leave a waitlist.",
  },
  {
    key: "pass",
    title: "My QR pass",
    description: "Open your rotating pass for class and reception check-in.",
  },
  {
    key: "membership",
    title: "My membership",
    description: "See plan status, dates, branch, and payment history.",
  },
];

export default function WorkspaceHomeScreen() {
  const { membershipId, mode } = useLocalSearchParams<{
    membershipId: string;
    mode?: string;
  }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const requestedMode = mode === "member" ? "member" : "staff";
  const canOpen =
    workspace &&
    (requestedMode === "member"
      ? workspace.hasMemberMode
      : workspace.hasStaffMode);

  if (!workspace || !canOpen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Workspace unavailable</Text>
          <Text style={styles.description}>
            Your access may have changed. Return to the workspace picker and refresh.
          </Text>
          <PrimaryButton
            label="Back to workspaces"
            onPress={() => router.replace("/")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const actions = requestedMode === "member" ? memberActions : staffActions;
  const assignedRoles = workspace.roles
    .filter((assignment) =>
      requestedMode === "member"
        ? assignment.role === "member"
        : assignment.role !== "member",
    )
    .map((assignment) => roleLabels[assignment.role])
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .join(" · ");

  const openMemberAction = (key: string) => {
    if (key === "classes") {
      router.push(
        `/member/${workspace.membershipId}/classes` as Href,
      );
    }
    if (key === "pass") {
      router.push(`/member/${workspace.membershipId}/pass` as Href);
    }
    if (key === "membership") {
      router.push(`/member/${workspace.membershipId}/membership` as Href);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Brand compact />
          <Pressable onPress={() => router.back()}>
            <Text style={styles.switchText}>Switch workspace</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.modeLabel}>
            {requestedMode === "member"
              ? "MEMBER WORKSPACE"
              : "OWNER / STAFF WORKSPACE"}
          </Text>
          <Text style={styles.title}>{workspace.organization.name}</Text>
          <Text style={styles.roleText}>{assignedRoles}</Text>
          <Text style={styles.description}>
            {requestedMode === "member"
              ? "Your training, bookings, pass, and membership in one place."
              : "Mobile gym operations for quick work away from the front desk."}
          </Text>
        </View>

        <View style={styles.branchStrip}>
          <Text style={styles.branchLabel}>ACCESS</Text>
          <Text style={styles.branchValue}>
            {workspace.branches.length > 0
              ? workspace.branches.map((branch) => branch.name).join(", ")
              : "Organization-wide"}
          </Text>
        </View>

        <View style={styles.actionList}>
          {actions.map((action, index) => {
            const actionKey = "key" in action ? action.key : null;
            const isAvailable =
              requestedMode === "member" &&
              (actionKey === "classes" ||
                actionKey === "pass" ||
                actionKey === "membership");
            return (
              <Pressable
                disabled={!isAvailable}
                key={action.title}
                onPress={
                  isAvailable && actionKey
                    ? () => openMemberAction(actionKey)
                    : undefined
                }
                style={({ pressed }) => [
                  styles.actionCard,
                  pressed && styles.actionPressed,
                ]}
              >
                <View style={styles.actionNumber}>
                  <Text style={styles.actionNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionDescription}>
                    {action.description}
                  </Text>
                  <Text style={styles.comingNext}>
                    {isAvailable
                      ? "OPEN"
                      : "AVAILABLE IN THE NEXT MOBILE SLICE"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: {
    alignSelf: "center",
    maxWidth: 760,
    padding: 22,
    width: "100%",
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  switchText: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  hero: { marginTop: 46 },
  modeLabel: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.2,
    marginTop: 8,
  },
  roleText: {
    color: colors.accentDeep,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 8,
  },
  description: {
    color: colors.inkMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    textAlign: "left",
  },
  branchStrip: {
    backgroundColor: colors.accentDeep,
    borderRadius: 18,
    marginTop: 28,
    padding: 18,
  },
  branchLabel: {
    color: colors.accentSoft,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  branchValue: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 6,
  },
  actionList: { gap: 13, marginTop: 24 },
  actionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: "row",
    padding: 18,
  },
  actionPressed: { opacity: 0.78 },
  actionNumber: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  actionNumberText: {
    color: colors.accentDeep,
    fontSize: 15,
    fontWeight: "900",
  },
  actionCopy: { flex: 1, marginLeft: 14 },
  actionTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  actionDescription: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  comingNext: {
    color: colors.accentDark,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 12,
  },
  missing: {
    alignSelf: "center",
    justifyContent: "center",
    maxWidth: 520,
    minHeight: "100%",
    padding: 24,
  },
  missingTitle: { color: colors.ink, fontSize: 28, fontWeight: "900" },
});
