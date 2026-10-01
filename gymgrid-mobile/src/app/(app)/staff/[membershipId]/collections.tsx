import { router, type Href, useLocalSearchParams } from "expo-router";
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
import { formatGymDate, formatMoney } from "@/lib/staff-data";
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

interface PaymentRow {
  id: string;
  member_id: string;
  receipt_code: string;
  amount_minor: number;
  currency: string;
  payment_date: string;
  payment_method: string;
  status: "recorded" | "voided";
}

interface MemberRow {
  id: string;
  member_code: string;
  full_name: string;
}

function methodLabel(value: string) {
  if (value === "upi") return "UPI";
  return value.replace("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function StaffCollectionsScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspace?.canManagePayments) {
      setError("Your role cannot view collections in this workspace.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const paymentsResult = await supabase
        .from("manual_payments")
        .select(
          "id, member_id, receipt_code, amount_minor, currency, payment_date, payment_method, status",
        )
        .eq("organization_id", workspace.organization.id)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (paymentsResult.error) throw paymentsResult.error;
      const paymentRows = (paymentsResult.data ?? []) as PaymentRow[];
      const memberIds = [...new Set(paymentRows.map((payment) => payment.member_id))];
      const membersResult = memberIds.length
        ? await supabase
            .from("members")
            .select("id, member_code, full_name")
            .eq("organization_id", workspace.organization.id)
            .in("id", memberIds)
        : { data: [], error: null };

      if (membersResult.error) throw membersResult.error;
      setPayments(paymentRows);
      setMembers((membersResult.data ?? []) as MemberRow[]);
    } catch (cause) {
      console.error("Mobile collections could not be loaded", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Recent collections could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );

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
            <Text style={styles.eyebrow}>OWNER / STAFF · COLLECTIONS</Text>
            <Text style={styles.title}>Recent receipts</Text>
            <Text style={styles.subtitle}>
              The latest 100 manual payments in your authorized branch scope.
            </Text>
          </View>
          <PrimaryButton
            label="Find member"
            onPress={() =>
              router.push(`/staff/${workspace.membershipId}/members` as Href)
            }
            style={styles.findButton}
            tone="secondary"
          />
        </View>

        {isLoading && payments.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.stateText}>Loading receipts…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Collections unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void refresh()} />
          </View>
        ) : payments.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>No payments yet</Text>
            <Text style={styles.stateText}>
              Find a member with an outstanding balance to record the first payment.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {payments.map((payment) => {
              const member = memberById.get(payment.member_id);
              return (
                <Pressable
                  key={payment.id}
                  onPress={() =>
                    router.push(
                      `/staff/${workspace.membershipId}/members/${payment.member_id}` as Href,
                    )
                  }
                  style={({ pressed }) => [
                    styles.receiptCard,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <View style={styles.receiptCopy}>
                      <Text style={styles.memberName}>
                        {member?.full_name ?? "Gym member"}
                      </Text>
                      <Text style={styles.receiptCode}>
                        {payment.receipt_code} · {member?.member_code ?? "Member"}
                      </Text>
                    </View>
                    <View style={styles.amountCopy}>
                      <Text
                        style={[
                          styles.amount,
                          payment.status === "voided" && styles.voided,
                        ]}
                      >
                        {formatMoney(payment.amount_minor, payment.currency)}
                      </Text>
                      <Text
                        style={[
                          styles.status,
                          payment.status === "voided" && styles.voided,
                        ]}
                      >
                        {payment.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>
                    {formatGymDate(payment.payment_date)} · {methodLabel(payment.payment_method)}
                  </Text>
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
  content: { alignSelf: "center", maxWidth: 720, padding: 22, paddingBottom: 44, width: "100%" },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  backText: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  headingRow: { alignItems: "flex-end", flexDirection: "row", gap: 14, marginBottom: 24, marginTop: 40 },
  headingCopy: { flex: 1 },
  eyebrow: { color: colors.accentDark, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 7 },
  subtitle: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 8 },
  findButton: { minHeight: 46 },
  list: { gap: 10 },
  receiptCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, padding: 17 },
  pressed: { opacity: 0.78 },
  rowBetween: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  receiptCopy: { flex: 1 },
  memberName: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  receiptCode: { color: colors.accentDark, fontSize: 10, fontWeight: "800", marginTop: 4 },
  amountCopy: { alignItems: "flex-end" },
  amount: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  status: { color: colors.accentDark, fontSize: 9, fontWeight: "900", marginTop: 4, textTransform: "uppercase" },
  voided: { color: colors.danger, textDecorationLine: "line-through" },
  meta: { color: colors.inkMuted, fontSize: 12, marginTop: 11 },
  centerState: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, gap: 14, marginTop: 10, padding: 28 },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", textAlign: "center" },
  errorTitle: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  stateText: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
