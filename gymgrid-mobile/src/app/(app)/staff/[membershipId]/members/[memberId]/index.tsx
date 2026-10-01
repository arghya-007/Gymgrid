import { router, type Href, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  formatGymDate,
  formatMoney,
  loadStaffMember,
  type StaffMember,
} from "@/lib/staff-data";
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

interface MembershipRow {
  id: string;
  enrollment_code: string;
  plan_name: string;
  status: "active" | "scheduled" | "frozen" | "expired" | "cancelled";
  start_date: string;
  end_date: string;
  contract_amount_minor: number;
  currency: string;
}

interface BalanceRow {
  membership_id: string;
  paid_amount_minor: number;
  outstanding_amount_minor: number;
}

export default function StaffMemberDetailScreen() {
  const { membershipId, memberId, created, enrolled, renewed, lifecycle, payment, invited } = useLocalSearchParams<{
    membershipId: string;
    memberId: string;
    created?: string;
    enrolled?: string;
    renewed?: string;
    lifecycle?: string;
    payment?: string;
    invited?: string;
  }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [member, setMember] = useState<StaffMember | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspace?.hasStaffMode || !memberId) {
      setError("This member workspace is no longer available.");
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
      if (!memberProfile) throw new Error("This member is not in your branch scope.");

      const [membershipsResult, balancesResult] = await Promise.all([
        supabase
          .from("member_membership_statuses")
          .select(
            "id, enrollment_code, plan_name, status, start_date, end_date, contract_amount_minor, currency",
          )
          .eq("organization_id", workspace.organization.id)
          .eq("member_id", memberId)
          .order("start_date", { ascending: false }),
        workspace.canManagePayments
          ? supabase
              .from("membership_payment_balances")
              .select(
                "membership_id, paid_amount_minor, outstanding_amount_minor",
              )
              .eq("organization_id", workspace.organization.id)
              .eq("member_id", memberId)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const firstError = membershipsResult.error ?? balancesResult.error;
      if (firstError) throw firstError;

      setMember(memberProfile);
      setMemberships((membershipsResult.data ?? []) as MembershipRow[]);
      setBalances((balancesResult.data ?? []) as BalanceRow[]);
    } catch (cause) {
      console.error("Staff member details could not be loaded", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "The member details could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [memberId, workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  const balanceByMembership = useMemo(
    () => new Map(balances.map((balance) => [balance.membership_id, balance])),
    [balances],
  );

  const prepareAndUploadPhoto = useCallback(
    async (source: "camera" | "library") => {
      if (!workspace?.canManageMembers || !member) return;

      setIsPhotoBusy(true);
      setError(null);

      try {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            throw new Error("Camera permission is needed to take a member photo.");
          }
        }

        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [1, 1],
                mediaTypes: ["images"],
                quality: 0.9,
              })
            : await ImagePicker.launchImageLibraryAsync({
                allowsEditing: true,
                aspect: [1, 1],
                mediaTypes: ["images"],
                quality: 0.9,
              });

        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        const context = ImageManipulator.manipulate(asset.uri);
        context.resize(
          asset.width >= asset.height
            ? { width: 512, height: null }
            : { width: null, height: 512 },
        );
        const rendered = await context.renderAsync();
        const prepared = await rendered.saveAsync({
          compress: 0.78,
          format: SaveFormat.JPEG,
        });
        const response = await fetch(prepared.uri);
        const photoBytes = await response.arrayBuffer();
        if (photoBytes.byteLength > 1024 * 1024) {
          throw new Error("The prepared photo is larger than 1 MB.");
        }

        const path = `${workspace.organization.id}/${member.id}/profile.jpg`;
        const uploadResult = await supabase.storage
          .from("member-photos")
          .upload(path, photoBytes, {
            cacheControl: "3600",
            contentType: "image/jpeg",
            upsert: true,
          });
        if (uploadResult.error) throw uploadResult.error;

        const profileResult = await supabase.rpc("set_member_photo", {
          p_organization_id: workspace.organization.id,
          p_member_id: member.id,
          p_photo_path: path,
          p_consent_version: "2026-10-v1",
        });
        if (profileResult.error) {
          await supabase.storage.from("member-photos").remove([path]);
          throw profileResult.error;
        }

        await refresh();
      } catch (cause) {
        console.error("Member photo could not be saved", cause);
        setError(
          cause instanceof Error
            ? cause.message
            : "The member photo could not be saved.",
        );
      } finally {
        setIsPhotoBusy(false);
      }
    },
    [member, refresh, workspace],
  );

  const requestPhotoConsent = useCallback(
    (source: "camera" | "library") => {
      Alert.alert(
        "Confirm member consent",
        "Only continue if the member agreed to their photograph being stored for gym operations.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Consent confirmed",
            onPress: () => void prepareAndUploadPhoto(source),
          },
        ],
      );
    },
    [prepareAndUploadPhoto],
  );

  const removePhoto = useCallback(async () => {
    if (!workspace?.canManageMembers || !member?.photoPath) return;
    setIsPhotoBusy(true);
    setError(null);

    try {
      const profileResult = await supabase.rpc("clear_member_photo", {
        p_organization_id: workspace.organization.id,
        p_member_id: member.id,
      });
      if (profileResult.error) throw profileResult.error;

      const removeResult = await supabase.storage
        .from("member-photos")
        .remove([member.photoPath]);
      if (removeResult.error) {
        console.error("Detached member photo object could not be removed", {
          message: removeResult.error.message,
        });
      }
      await refresh();
    } catch (cause) {
      console.error("Member photo could not be removed", cause);
      setError("The member photo could not be removed. Please try again.");
    } finally {
      setIsPhotoBusy(false);
    }
  }, [member, refresh, workspace]);

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
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>Members</Text>
          </Pressable>
        </View>

        {created && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>
              Member {String(created).slice(0, 20)} was created. Add their first plan when ready.
            </Text>
          </View>
        )}
        {enrolled && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>
              Enrolment {String(enrolled).slice(0, 20)} was created successfully.
            </Text>
          </View>
        )}
        {renewed && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>
              Renewal {String(renewed).slice(0, 20)} was created successfully.
            </Text>
          </View>
        )}
        {lifecycle && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>
              The membership was {String(lifecycle).slice(0, 20)} successfully.
            </Text>
          </View>
        )}
        {payment && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>
              Payment {String(payment).slice(0, 20)} was recorded successfully.
            </Text>
          </View>
        )}
        {invited && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>
              Member app invitation prepared for {String(invited).slice(0, 120)}.
            </Text>
          </View>
        )}

        {isLoading && !member ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.stateText}>Loading member…</Text>
          </View>
        ) : error || !member ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Member unavailable</Text>
            <Text style={styles.stateText}>{error ?? "This member could not be found."}</Text>
            <PrimaryButton label="Try again" onPress={() => void refresh()} />
          </View>
        ) : (
          <>
            <View style={styles.profileCard}>
              <View style={styles.profileTop}>
                {member.photoUrl ? (
                  <Image
                    accessibilityLabel={`${member.fullName} profile`}
                    contentFit="cover"
                    source={{ uri: member.photoUrl }}
                    style={styles.profilePhoto}
                  />
                ) : (
                  <View style={styles.profilePhotoFallback}>
                    <Text style={styles.profilePhotoInitials}>
                      {member.fullName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join("")}
                    </Text>
                  </View>
                )}
                <View style={styles.profileCopy}>
                  <Text style={styles.memberCode}>{member.memberCode}</Text>
                  <Text style={styles.memberName}>{member.fullName}</Text>
                  <Text style={styles.memberMeta}>
                    {member.phone}{member.email ? ` · ${member.email}` : ""}
                  </Text>
                </View>
                <Text style={styles.profileStatus}>{member.status}</Text>
              </View>
              {workspace.canManageMembers && (
                <View style={styles.photoActions}>
                  <MiniAction
                    label={isPhotoBusy ? "Working…" : "Take photo"}
                    onPress={() => requestPhotoConsent("camera")}
                  />
                  <MiniAction
                    label={member.photoPath ? "Replace from gallery" : "Choose from gallery"}
                    onPress={() => requestPhotoConsent("library")}
                  />
                  {member.photoPath && (
                    <MiniAction
                      label="Remove photo"
                      onPress={() =>
                        Alert.alert(
                          "Remove member photo?",
                          "The photo will be detached from the profile and deleted from private storage.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Remove",
                              style: "destructive",
                              onPress: () => void removePhoto(),
                            },
                          ],
                        )
                      }
                      tone="warning"
                    />
                  )}
                </View>
              )}
              <View style={styles.branchStrip}>
                <Text style={styles.branchLabel}>HOME BRANCH</Text>
                <Text style={styles.branchName}>
                  {branch?.name ?? "Assigned branch"}
                </Text>
              </View>
              <View style={styles.branchStrip}>
                <Text style={styles.branchLabel}>MEMBER APP ACCESS</Text>
                <Text style={styles.branchName}>
                  {member.authUserId ? "Linked account" : "Not linked yet"}
                </Text>
              </View>
              {workspace.canManageMembers &&
                member.status === "active" &&
                !member.authUserId && (
                  <PrimaryButton
                    label="Invite to member app"
                    onPress={() =>
                      router.push(
                        `/staff/${workspace.membershipId}/members/${member.id}/invite` as Href,
                      )
                    }
                    tone="secondary"
                  />
                )}
              {workspace.canManageMemberships && member.status === "active" && (
                <PrimaryButton
                  label="Enrol in a plan"
                  onPress={() =>
                    router.push(
                      `/staff/${workspace.membershipId}/members/${member.id}/enroll` as Href,
                    )
                  }
                />
              )}
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Membership history</Text>
              <Text style={styles.sectionSubtitle}>
                Preserved plan terms and current payment balance.
              </Text>
            </View>

            {memberships.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.stateTitle}>No enrolments yet</Text>
                <Text style={styles.stateText}>
                  Assign the member’s first active plan from this device.
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {memberships.map((membership) => {
                  const balance = balanceByMembership.get(membership.id);
                  const outstanding =
                    balance?.outstanding_amount_minor ??
                    membership.contract_amount_minor;
                  return (
                    <View key={membership.id} style={styles.membershipCard}>
                      <View style={styles.rowBetween}>
                        <View style={styles.flexCopy}>
                          <Text style={styles.planName}>{membership.plan_name}</Text>
                          <Text style={styles.enrollmentCode}>
                            {membership.enrollment_code}
                          </Text>
                        </View>
                        <Text style={styles.membershipStatus}>
                          {membership.status}
                        </Text>
                      </View>
                      <Text style={styles.membershipMeta}>
                        {formatGymDate(membership.start_date)} – {formatGymDate(membership.end_date)}
                      </Text>
                      {workspace.canManagePayments ? (
                        <View style={styles.balanceRow}>
                          <Text style={styles.balanceText}>
                            {formatMoney(
                              balance?.paid_amount_minor ?? 0,
                              membership.currency,
                            )} paid
                          </Text>
                          <Text style={styles.dueText}>
                            {formatMoney(outstanding, membership.currency)} due
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.membershipMeta}>
                          Contract {formatMoney(
                            membership.contract_amount_minor,
                            membership.currency,
                          )}
                        </Text>
                      )}
                      <View style={styles.actionRow}>
                        {workspace.canManageMemberships &&
                          !["frozen", "cancelled"].includes(
                            membership.status,
                          ) && (
                            <MiniAction
                              label="Renew"
                              onPress={() =>
                                router.push(
                                  `/staff/${workspace.membershipId}/members/${member.id}/memberships/${membership.id}/renew` as Href,
                                )
                              }
                            />
                          )}
                        {workspace.canManageMemberships &&
                          ["active", "scheduled", "frozen"].includes(
                            membership.status,
                          ) && (
                            <MiniAction
                              label="Manage"
                              onPress={() =>
                                router.push(
                                  `/staff/${workspace.membershipId}/members/${member.id}/memberships/${membership.id}/manage` as Href,
                                )
                              }
                            />
                          )}
                        {workspace.canManagePayments && outstanding > 0 && (
                          <MiniAction
                            label="Record payment"
                            onPress={() =>
                              router.push(
                                `/staff/${workspace.membershipId}/members/${member.id}/memberships/${membership.id}/payment` as Href,
                              )
                            }
                            tone="warning"
                          />
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniAction({
  label,
  onPress,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  tone?: "default" | "warning";
}) {
  return (
    <Pressable onPress={onPress} style={styles.miniAction}>
      <Text
        style={[
          styles.miniActionText,
          tone === "warning" && styles.miniActionWarning,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { alignSelf: "center", maxWidth: 720, padding: 22, paddingBottom: 44, width: "100%" },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  backText: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  successCard: { backgroundColor: colors.accentSoft, borderRadius: 14, marginBottom: 14, padding: 14 },
  successText: { color: colors.accentDeep, fontSize: 13, fontWeight: "700" },
  profileCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 24, borderWidth: 1, gap: 18, padding: 21 },
  profileTop: { alignItems: "flex-start", flexDirection: "row", gap: 14 },
  profilePhoto: { borderRadius: 18, height: 72, width: 72 },
  profilePhotoFallback: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 18, height: 72, justifyContent: "center", width: 72 },
  profilePhotoInitials: { color: colors.accentDeep, fontSize: 20, fontWeight: "900" },
  profileCopy: { flex: 1 },
  memberCode: { color: colors.accentDark, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  memberName: { color: colors.ink, fontSize: 28, fontWeight: "900", letterSpacing: -0.8, marginTop: 5 },
  memberMeta: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  profileStatus: { color: colors.accentDark, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  branchStrip: { backgroundColor: colors.surfaceMuted, borderRadius: 13, padding: 13 },
  branchLabel: { color: colors.inkMuted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  branchName: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: 4 },
  photoActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sectionHeading: { marginBottom: 12, marginTop: 30 },
  sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: "900" },
  sectionSubtitle: { color: colors.inkMuted, fontSize: 13, marginTop: 4 },
  list: { gap: 11 },
  membershipCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 9, padding: 17 },
  rowBetween: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  flexCopy: { flex: 1 },
  planName: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  enrollmentCode: { color: colors.accentDark, fontSize: 10, fontWeight: "800", marginTop: 3 },
  membershipStatus: { color: colors.accentDark, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  membershipMeta: { color: colors.inkMuted, fontSize: 12 },
  balanceRow: { flexDirection: "row", gap: 15 },
  balanceText: { color: colors.accentDark, fontSize: 12, fontWeight: "800" },
  dueText: { color: colors.warning, fontSize: 12, fontWeight: "800" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 },
  miniAction: { backgroundColor: colors.surfaceMuted, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  miniActionText: { color: colors.accentDark, fontSize: 11, fontWeight: "900" },
  miniActionWarning: { color: colors.warning },
  emptyCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 8, padding: 26 },
  centerState: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, gap: 14, padding: 28 },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", textAlign: "center" },
  errorTitle: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  stateText: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
