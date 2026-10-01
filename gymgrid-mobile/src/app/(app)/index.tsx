import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Brand } from "@/components/brand";
import { PrimaryButton } from "@/components/primary-button";
import { colors } from "@/constants/colors";
import { useAuth } from "@/providers/auth-provider";
import {
  type TenantWorkspace,
  useWorkspaces,
} from "@/providers/workspace-provider";

const roleLabels = {
  gym_owner: "Owner",
  gym_manager: "Manager",
  receptionist: "Reception",
  trainer: "Trainer",
  accountant: "Accounts",
  member: "Member",
} as const;

function WorkspaceCard({ workspace }: { workspace: TenantWorkspace }) {
  const roleSummary = workspace.roles
    .map((assignment) => roleLabels[assignment.role])
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .join(" · ");

  const openWorkspace = (mode: "staff" | "member") => {
    router.push({
      pathname: "/workspace/[membershipId]",
      params: { membershipId: workspace.membershipId, mode },
    });
  };

  return (
    <View style={styles.workspaceCard}>
      <View style={styles.workspaceHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {workspace.organization.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.workspaceTitleGroup}>
          <Text style={styles.workspaceName}>{workspace.organization.name}</Text>
          <Text style={styles.roleSummary}>{roleSummary}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{workspace.organization.status}</Text>
        </View>
      </View>

      <Text style={styles.branchText}>
        {workspace.branches.length === 0
          ? "Organization-wide access"
          : `${workspace.branches.length} accessible ${workspace.branches.length === 1 ? "branch" : "branches"}`}
      </Text>

      <View style={styles.modeActions}>
        {workspace.hasStaffMode && (
          <PrimaryButton
            label="Open owner / staff workspace"
            onPress={() => openWorkspace("staff")}
            style={styles.modeButton}
          />
        )}
        {workspace.hasMemberMode && (
          <PrimaryButton
            label="Open member workspace"
            onPress={() => openWorkspace("member")}
            style={styles.modeButton}
            tone="secondary"
          />
        )}
      </View>
    </View>
  );
}

export default function WorkspacePickerScreen() {
  const { signOut, user } = useAuth();
  const { error, isLoading, refresh, workspaces } = useWorkspaces();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.accent]}
            onRefresh={() => void refresh()}
            refreshing={isLoading}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.topBar}>
          <Brand compact />
          <Pressable onPress={() => void signOut()}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.headingBlock}>
          <Text style={styles.eyebrow}>CHOOSE YOUR VIEW</Text>
          <Text style={styles.title}>Your GymGrid workspaces</Text>
          <Text style={styles.subtitle}>
            {user?.email ?? "Signed-in account"}. Switch between gym operations and your member experience.
          </Text>
        </View>

        {isLoading && workspaces.length === 0 ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.stateText}>Loading gym access…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Text style={styles.errorTitle}>We could not load your access</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void refresh()} />
          </View>
        ) : workspaces.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.emptyTitle}>No active gym access yet</Text>
            <Text style={styles.stateText}>
              Ask your gym owner to invite this email or link it to your member record, then refresh.
            </Text>
            <PrimaryButton label="Refresh access" onPress={() => void refresh()} />
          </View>
        ) : (
          <View style={styles.workspaceList}>
            {workspaces.map((workspace) => (
              <WorkspaceCard key={workspace.membershipId} workspace={workspace} />
            ))}
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
    maxWidth: 760,
    padding: 22,
    width: "100%",
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signOut: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  headingBlock: { marginBottom: 24, marginTop: 42 },
  eyebrow: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
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
  workspaceList: { gap: 16 },
  workspaceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  workspaceHeader: { alignItems: "center", flexDirection: "row" },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: { color: colors.accentDeep, fontSize: 20, fontWeight: "900" },
  workspaceTitleGroup: { flex: 1, marginLeft: 12 },
  workspaceName: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  roleSummary: { color: colors.inkMuted, fontSize: 13, marginTop: 3 },
  statusPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    color: colors.accentDeep,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  branchText: { color: colors.inkMuted, fontSize: 13, marginTop: 16 },
  modeActions: { gap: 10, marginTop: 18 },
  modeButton: { width: "100%" },
  stateCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 28,
  },
  stateText: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  errorTitle: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: "900" },
});
