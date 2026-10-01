import { router, type Href, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

interface MemberRow {
  id: string;
  member_code: string;
  full_name: string;
  preferred_name: string | null;
  phone: string;
  status: "active" | "inactive" | "archived";
  home_branch_id: string;
}

interface MembershipSummaryRow {
  member_id: string;
  plan_name: string;
  status: "active" | "scheduled" | "frozen" | "expired" | "cancelled";
  start_date: string;
}

export default function StaffMembersScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipSummaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspace?.hasStaffMode) {
      setError("This staff workspace is no longer available.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      let query = supabase
        .from("members")
        .select(
          "id, member_code, full_name, preferred_name, phone, status, home_branch_id",
        )
        .eq("organization_id", workspace.organization.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,member_code.ilike.%${search}%,phone.ilike.%${search}%`,
        );
      }

      const membersResult = await query;
      if (membersResult.error) throw membersResult.error;

      const memberRows = (membersResult.data ?? []) as MemberRow[];
      const memberIds = memberRows.map((member) => member.id);
      const membershipsResult = memberIds.length
        ? await supabase
            .from("member_membership_statuses")
            .select("member_id, plan_name, status, start_date")
            .eq("organization_id", workspace.organization.id)
            .in("member_id", memberIds)
            .order("start_date", { ascending: false })
        : { data: [], error: null };

      if (membershipsResult.error) throw membershipsResult.error;

      setMembers(memberRows);
      setMemberships(
        (membershipsResult.data ?? []) as MembershipSummaryRow[],
      );
    } catch (cause) {
      console.error("Staff member directory could not be loaded", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "The member directory could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [search, workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  const latestByMember = useMemo(() => {
    const result = new Map<string, MembershipSummaryRow>();
    for (const membership of memberships) {
      if (!result.has(membership.member_id)) {
        result.set(membership.member_id, membership);
      }
    }
    return result;
  }, [memberships]);

  const submitSearch = () => {
    setSearch(
      draftSearch
        .trim()
        .replace(/[^a-zA-Z0-9 @+.-]/g, "")
        .slice(0, 60),
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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
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
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>OWNER / STAFF · MEMBERS</Text>
            <Text style={styles.title}>Member directory</Text>
            <Text style={styles.subtitle}>
              Up to 100 recent members in your authorized branch scope.
            </Text>
          </View>
          {workspace.canManageMembers && (
            <PrimaryButton
              label="Add member"
              onPress={() =>
                router.push(
                  `/staff/${workspace.membershipId}/members/new` as Href,
                )
              }
              style={styles.addButton}
            />
          )}
        </View>

        <View style={styles.searchRow}>
          <TextInput
            autoCapitalize="words"
            onChangeText={setDraftSearch}
            onSubmitEditing={submitSearch}
            placeholder="Name, code, or phone"
            placeholderTextColor={colors.inkMuted}
            returnKeyType="search"
            style={styles.searchInput}
            value={draftSearch}
          />
          <PrimaryButton label="Search" onPress={submitSearch} style={styles.searchButton} tone="secondary" />
        </View>

        {isLoading && members.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.stateText}>Loading members…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Directory unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void refresh()} />
          </View>
        ) : members.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>
              {search ? "No matching members" : "No members yet"}
            </Text>
            <Text style={styles.stateText}>
              {search
                ? "Try a different name, member code, or phone."
                : "Add the gym’s first member from this device."}
            </Text>
          </View>
        ) : (
          <View style={styles.memberList}>
            {members.map((member) => {
              const latest = latestByMember.get(member.id);
              const branch = workspace.branches.find(
                (candidate) => candidate.id === member.home_branch_id,
              );

              return (
                <Pressable
                  key={member.id}
                  onPress={() =>
                    router.push(
                      `/staff/${workspace.membershipId}/members/${member.id}` as Href,
                    )
                  }
                  style={({ pressed }) => [
                    styles.memberCard,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.memberTop}>
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName}>{member.full_name}</Text>
                      <Text style={styles.memberCode}>{member.member_code}</Text>
                    </View>
                    <Text style={styles.profileStatus}>{member.status}</Text>
                  </View>
                  <Text style={styles.memberMeta}>
                    {member.phone} · {branch?.name ?? "Assigned branch"}
                  </Text>
                  <View style={styles.membershipStrip}>
                    <Text style={styles.planName}>
                      {latest?.plan_name ?? "No membership"}
                    </Text>
                    <Text style={styles.planStatus}>
                      {latest?.status ?? "NOT ENROLLED"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
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
    paddingBottom: 44,
    width: "100%",
  },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  backText: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  headingRow: { alignItems: "flex-end", flexDirection: "row", gap: 16, marginTop: 40 },
  headingCopy: { flex: 1 },
  eyebrow: { color: colors.accentDark, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 7 },
  subtitle: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 8 },
  addButton: { minHeight: 46 },
  searchRow: { alignItems: "center", flexDirection: "row", gap: 10, marginVertical: 24 },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  searchButton: { minHeight: 52 },
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
  stateText: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  memberList: { gap: 11 },
  memberCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 19,
    borderWidth: 1,
    padding: 17,
  },
  pressed: { opacity: 0.78 },
  memberTop: { alignItems: "flex-start", flexDirection: "row" },
  memberCopy: { flex: 1 },
  memberName: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  memberCode: { color: colors.accentDark, fontSize: 11, fontWeight: "800", marginTop: 3 },
  profileStatus: { color: colors.inkMuted, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  memberMeta: { color: colors.inkMuted, fontSize: 12, marginTop: 9 },
  membershipStrip: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    flexDirection: "row",
    marginTop: 14,
    padding: 11,
  },
  planName: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: "800" },
  planStatus: { color: colors.accentDark, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
});
