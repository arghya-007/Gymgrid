import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { loadMyMemberProfile, type MemberProfile } from "@/lib/member-data";
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

type MembershipStatus =
  | "active"
  | "scheduled"
  | "frozen"
  | "expired"
  | "cancelled";

interface MembershipRow {
  id: string;
  branch_id: string;
  enrollment_code: string;
  plan_name: string;
  status: MembershipStatus;
  start_date: string;
  end_date: string;
  contract_amount_minor: number;
  currency: string;
  tax_inclusive: boolean;
  cancellation_reason: string | null;
}

interface PaymentRow {
  id: string;
  membership_id: string;
  receipt_code: string;
  amount_minor: number;
  currency: string;
  payment_date: string;
  payment_method:
    | "cash"
    | "upi"
    | "card"
    | "bank_transfer"
    | "cheque"
    | "other";
  status: "recorded" | "voided";
  transaction_reference: string | null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    currency,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(amountMinor / 100);
}

function labelPaymentMethod(method: PaymentRow["payment_method"]) {
  if (method === "upi") return "UPI";
  return method.replace("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function MemberMembershipScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

      const [membershipsResult, paymentsResult] = await Promise.all([
        supabase
          .from("member_membership_statuses")
          .select(
            "id, branch_id, enrollment_code, plan_name, status, start_date, end_date, contract_amount_minor, currency, tax_inclusive, cancellation_reason",
          )
          .eq("organization_id", workspace.organization.id)
          .eq("member_id", memberProfile.id)
          .order("start_date", { ascending: false }),
        supabase
          .from("manual_payments")
          .select(
            "id, membership_id, receipt_code, amount_minor, currency, payment_date, payment_method, status, transaction_reference",
          )
          .eq("organization_id", workspace.organization.id)
          .eq("member_id", memberProfile.id)
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      const firstError = membershipsResult.error ?? paymentsResult.error;
      if (firstError) throw firstError;

      setMember(memberProfile);
      setMemberships((membershipsResult.data ?? []) as MembershipRow[]);
      setPayments((paymentsResult.data ?? []) as PaymentRow[]);
    } catch (cause) {
      console.error("Member membership history could not be loaded", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Your membership details could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  const paidByMembership = useMemo(() => {
    const totals = new Map<string, number>();
    for (const payment of payments) {
      if (payment.status !== "recorded") continue;
      totals.set(
        payment.membership_id,
        (totals.get(payment.membership_id) ?? 0) + payment.amount_minor,
      );
    }
    return totals;
  }, [payments]);

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
  const currentMembership = memberships.find((membership) =>
    ["active", "frozen"].includes(membership.status),
  );
  const nextMembership = memberships.find(
    (membership) => membership.status === "scheduled",
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
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>MEMBER · MEMBERSHIP</Text>
          <Text style={styles.title}>Your plan and payments</Text>
          <Text style={styles.subtitle}>
            {member?.memberCode ?? "Member"} · {branch?.name ?? "Assigned branch"}
          </Text>
        </View>

        {isLoading && memberships.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.stateText}>Loading your membership…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Membership unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void refresh()} />
          </View>
        ) : memberships.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>No membership yet</Text>
            <Text style={styles.stateText}>
              Ask your gym team to enrol you in an active plan.
            </Text>
          </View>
        ) : (
          <>
            {currentMembership && (
              <View style={styles.currentCard}>
                <View style={styles.currentHeader}>
                  <View style={styles.currentCopy}>
                    <Text style={styles.currentLabel}>CURRENT PLAN</Text>
                    <Text style={styles.currentName}>
                      {currentMembership.plan_name}
                    </Text>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>
                      {currentMembership.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.currentDates}>
                  {formatDate(currentMembership.start_date)} – {formatDate(currentMembership.end_date)}
                </Text>
                <View style={styles.amountGrid}>
                  <Amount
                    label="CONTRACT"
                    value={formatMoney(
                      currentMembership.contract_amount_minor,
                      currentMembership.currency,
                    )}
                  />
                  <Amount
                    label="PAID"
                    value={formatMoney(
                      paidByMembership.get(currentMembership.id) ?? 0,
                      currentMembership.currency,
                    )}
                  />
                  <Amount
                    label="OUTSTANDING"
                    value={formatMoney(
                      Math.max(
                        currentMembership.contract_amount_minor -
                          (paidByMembership.get(currentMembership.id) ?? 0),
                        0,
                      ),
                      currentMembership.currency,
                    )}
                  />
                </View>
                <Text style={styles.taxText}>
                  {currentMembership.enrollment_code} · Tax {currentMembership.tax_inclusive ? "included" : "excluded"}
                </Text>
              </View>
            )}

            {nextMembership && (
              <View style={styles.upcomingCard}>
                <View style={styles.flexCopy}>
                  <Text style={styles.upcomingLabel}>NEXT PLAN</Text>
                  <Text style={styles.upcomingName}>{nextMembership.plan_name}</Text>
                  <Text style={styles.cardMeta}>
                    Starts {formatDate(nextMembership.start_date)} · {nextMembership.enrollment_code}
                  </Text>
                </View>
                <Text style={styles.upcomingAmount}>
                  {formatMoney(
                    nextMembership.contract_amount_minor,
                    nextMembership.currency,
                  )}
                </Text>
              </View>
            )}

            <SectionHeading
              subtitle="Your preserved plan, date, and price terms."
              title="Membership history"
            />
            <View style={styles.list}>
              {memberships.map((membership) => {
                const paid = paidByMembership.get(membership.id) ?? 0;
                const due = Math.max(membership.contract_amount_minor - paid, 0);
                const membershipBranch = workspace.branches.find(
                  (candidate) => candidate.id === membership.branch_id,
                );

                return (
                  <View key={membership.id} style={styles.historyCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.flexCopy}>
                        <Text style={styles.cardTitle}>{membership.plan_name}</Text>
                        <Text style={styles.cardCode}>{membership.enrollment_code}</Text>
                      </View>
                      <Text style={styles.historyStatus}>{membership.status}</Text>
                    </View>
                    <Text style={styles.cardMeta}>
                      {formatDate(membership.start_date)} – {formatDate(membership.end_date)}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {membershipBranch?.name ?? "Assigned branch"} · {formatMoney(paid, membership.currency)} paid · {formatMoney(due, membership.currency)} due
                    </Text>
                    {membership.cancellation_reason && (
                      <Text style={styles.cancelText}>
                        Cancellation: {membership.cancellation_reason}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            <SectionHeading
              subtitle="Receipts recorded by your gym, including voided entries."
              title="Payment history"
            />
            {payments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.stateText}>No payments have been recorded yet.</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {payments.map((payment) => (
                  <View key={payment.id} style={styles.receiptCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.flexCopy}>
                        <Text style={styles.cardTitle}>{payment.receipt_code}</Text>
                        <Text style={styles.cardMeta}>
                          {formatDate(payment.payment_date)} · {labelPaymentMethod(payment.payment_method)}
                        </Text>
                      </View>
                      <View style={styles.receiptAmount}>
                        <Text
                          style={[
                            styles.amountText,
                            payment.status === "voided" && styles.voidedText,
                          ]}
                        >
                          {formatMoney(payment.amount_minor, payment.currency)}
                        </Text>
                        <Text
                          style={[
                            styles.receiptStatus,
                            payment.status === "voided" && styles.voidedText,
                          ]}
                        >
                          {payment.status}
                        </Text>
                      </View>
                    </View>
                    {payment.transaction_reference && (
                      <Text style={styles.referenceText}>
                        Ref: {payment.transaction_reference}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.amountItem}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={styles.amountValue}>{value}</Text>
    </View>
  );
}

function SectionHeading({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: {
    alignSelf: "center",
    maxWidth: 720,
    padding: 22,
    paddingBottom: 44,
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
  subtitle: { color: colors.inkMuted, fontSize: 15, marginTop: 10 },
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
  currentCard: {
    backgroundColor: colors.accentDeep,
    borderRadius: 24,
    padding: 22,
  },
  currentHeader: { alignItems: "flex-start", flexDirection: "row" },
  currentCopy: { flex: 1 },
  currentLabel: {
    color: colors.accentSoft,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  currentName: {
    color: colors.surface,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 6,
  },
  statusPill: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  statusPillText: {
    color: colors.accentDeep,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  currentDates: { color: colors.surfaceMuted, fontSize: 14, marginTop: 10 },
  amountGrid: { flexDirection: "row", gap: 10, marginTop: 22 },
  amountItem: { flex: 1 },
  amountLabel: {
    color: colors.accentSoft,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  amountValue: { color: colors.surface, fontSize: 14, fontWeight: "900", marginTop: 5 },
  taxText: { color: colors.surfaceMuted, fontSize: 11, marginTop: 18 },
  upcomingCard: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    flexDirection: "row",
    gap: 14,
    marginTop: 12,
    padding: 17,
  },
  upcomingLabel: {
    color: colors.accentDark,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  upcomingName: { color: colors.accentDeep, fontSize: 17, fontWeight: "900", marginVertical: 4 },
  upcomingAmount: { color: colors.accentDeep, fontSize: 14, fontWeight: "900" },
  sectionHeading: { marginBottom: 12, marginTop: 30 },
  sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: "900" },
  sectionSubtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  list: { gap: 11 },
  historyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 7,
    padding: 17,
  },
  receiptCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 17,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
  },
  rowBetween: { alignItems: "flex-start", flexDirection: "row", gap: 14 },
  flexCopy: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  cardCode: { color: colors.accentDark, fontSize: 11, fontWeight: "800", marginTop: 3 },
  cardMeta: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  historyStatus: {
    color: colors.accentDark,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  cancelText: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  receiptAmount: { alignItems: "flex-end" },
  amountText: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  receiptStatus: {
    color: colors.accentDark,
    fontSize: 9,
    fontWeight: "900",
    marginTop: 4,
    textTransform: "uppercase",
  },
  voidedText: { color: colors.danger, textDecorationLine: "line-through" },
  referenceText: { color: colors.inkMuted, fontSize: 11, marginTop: 9 },
});
