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
import { formatMoney, todayInTimezone } from "@/lib/staff-data";
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

type PaymentMethod =
  | "cash"
  | "upi"
  | "card"
  | "bank_transfer"
  | "cheque"
  | "other";

interface BalanceRow {
  membership_id: string;
  member_id: string;
  plan_name: string;
  enrollment_code: string;
  contract_amount_minor: number;
  paid_amount_minor: number;
  outstanding_amount_minor: number;
  currency: string;
}

interface PaymentResult {
  payment_id: string;
  receipt_code: string;
}

const paymentMethods: { label: string; value: PaymentMethod }[] = [
  { label: "Cash", value: "cash" },
  { label: "UPI", value: "upi" },
  { label: "Card", value: "card" },
  { label: "Bank transfer", value: "bank_transfer" },
  { label: "Cheque", value: "cheque" },
  { label: "Other", value: "other" },
];

function parseAmountMinor(value: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export default function StaffRecordPaymentScreen() {
  const { membershipId, memberId, memberRecordId } = useLocalSearchParams<{
    membershipId: string;
    memberId: string;
    memberRecordId: string;
  }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [balance, setBalance] = useState<BalanceRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [paymentDate, setPaymentDate] = useState(
    workspace ? todayInTimezone(workspace.organization.timezone) : "",
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!workspace?.canManagePayments) {
      setError("Your role cannot collect payments in this workspace.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await supabase
        .from("membership_payment_balances")
        .select(
          "membership_id, member_id, plan_name, enrollment_code, contract_amount_minor, paid_amount_minor, outstanding_amount_minor, currency",
        )
        .eq("organization_id", workspace.organization.id)
        .eq("member_id", memberId)
        .eq("membership_id", memberRecordId)
        .maybeSingle();

      if (result.error) throw result.error;
      const balanceRow = result.data as BalanceRow | null;
      if (!balanceRow) throw new Error("This membership is not in your branch scope.");

      setBalance(balanceRow);
      setAmount((current) =>
        current || (balanceRow.outstanding_amount_minor / 100).toFixed(2),
      );
      setPaymentDate((current) =>
        current || todayInTimezone(workspace.organization.timezone),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The payment form could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [memberId, memberRecordId, setAmount, setBalance, setPaymentDate, workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  const savePayment = async () => {
    if (!workspace || !balance) return;

    const amountMinor = parseAmountMinor(amount.trim());
    const cleanReference = reference.trim();
    const cleanNotes = notes.trim();
    if (
      amountMinor === null ||
      amountMinor <= 0 ||
      amountMinor > balance.outstanding_amount_minor
    ) {
      setMessage("Enter an amount up to the current outstanding balance.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setMessage("Use a valid payment date in YYYY-MM-DD format.");
      return;
    }
    if (cleanReference.length === 1 || cleanReference.length > 120) {
      setMessage("Use 2 to 120 characters for a reference, or leave it blank.");
      return;
    }
    if (cleanNotes.length > 1000) {
      setMessage("Notes must be 1,000 characters or fewer.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const { data, error: paymentError } = await supabase.rpc(
        "record_manual_payment",
        {
          p_organization_id: workspace.organization.id,
          p_membership_id: balance.membership_id,
          p_amount_minor: amountMinor,
          p_payment_method: method,
          p_payment_date: paymentDate,
          p_transaction_reference: cleanReference || null,
          p_notes: cleanNotes || null,
        },
      );

      if (paymentError) throw paymentError;

      const result = (data as PaymentResult[] | null)?.[0];
      router.replace(
        `/staff/${workspace.membershipId}/members/${memberId}?payment=${encodeURIComponent(result?.receipt_code ?? "recorded")}` as Href,
      );
    } catch (cause) {
      const paymentError = cause as { code?: string; message?: string };
      if (paymentError.code === "42501") {
        setMessage("Your role cannot record this payment.");
      } else if (paymentError.code === "22023") {
        setMessage("The amount, date, or outstanding balance changed. Refresh and try again.");
      } else {
        setMessage(paymentError.message ?? "The payment could not be recorded.");
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
          <Text style={styles.eyebrow}>OWNER / STAFF · COLLECTION</Text>
          <Text style={styles.title}>Record payment</Text>
          <Text style={styles.subtitle}>
            Record an offline payment and create the next audited receipt number.
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
            <Text style={styles.stateText}>Loading balance…</Text>
          </View>
        ) : error || !balance ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Payment unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void load()} />
          </View>
        ) : balance.outstanding_amount_minor <= 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>No amount due</Text>
            <Text style={styles.stateText}>This membership has been paid in full.</Text>
          </View>
        ) : (
          <View style={styles.formCard}>
            <View style={styles.balanceCard}>
              <Text style={styles.planName}>{balance.plan_name}</Text>
              <Text style={styles.code}>{balance.enrollment_code}</Text>
              <View style={styles.balanceRow}>
                <Text style={styles.paidText}>
                  {formatMoney(balance.paid_amount_minor, balance.currency)} paid
                </Text>
                <Text style={styles.dueText}>
                  {formatMoney(balance.outstanding_amount_minor, balance.currency)} due
                </Text>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>AMOUNT ({balance.currency}) *</Text>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
                value={amount}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PAYMENT METHOD *</Text>
              <View style={styles.choiceList}>
                {paymentMethods.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setMethod(option.value)}
                    style={[styles.choice, method === option.value && styles.choiceSelected]}
                  >
                    <Text style={[styles.choiceText, method === option.value && styles.choiceTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PAYMENT DATE *</Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                onChangeText={setPaymentDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
                value={paymentDate}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>TRANSACTION REFERENCE</Text>
              <TextInput
                onChangeText={setReference}
                placeholder="UPI, cheque, or bank reference"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
                value={reference}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>NOTES</Text>
              <TextInput
                multiline
                onChangeText={setNotes}
                placeholder="Optional collection notes"
                placeholderTextColor={colors.inkMuted}
                style={[styles.input, styles.multiline]}
                value={notes}
              />
            </View>
            <PrimaryButton
              label="Record payment"
              loading={isSaving}
              onPress={() => void savePayment()}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { alignSelf: "center", maxWidth: 660, padding: 22, paddingBottom: 44, width: "100%" },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  backText: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  heading: { marginBottom: 24, marginTop: 40 },
  eyebrow: { color: colors.accentDark, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 7 },
  subtitle: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 9 },
  messageCard: { backgroundColor: colors.dangerSoft, borderRadius: 14, marginBottom: 14, padding: 14 },
  messageText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  formCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 22, borderWidth: 1, gap: 19, padding: 20 },
  balanceCard: { backgroundColor: colors.surfaceMuted, borderRadius: 15, padding: 16 },
  planName: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  code: { color: colors.accentDark, fontSize: 11, fontWeight: "800", marginTop: 4 },
  balanceRow: { flexDirection: "row", gap: 16, marginTop: 12 },
  paidText: { color: colors.accentDark, fontSize: 12, fontWeight: "800" },
  dueText: { color: colors.warning, fontSize: 12, fontWeight: "900" },
  fieldGroup: { gap: 7 },
  label: { color: colors.inkMuted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  input: { backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 13, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12 },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  choiceList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  choiceSelected: { backgroundColor: colors.accentDeep, borderColor: colors.accentDeep },
  choiceText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  choiceTextSelected: { color: colors.surface },
  centerState: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, gap: 14, padding: 28 },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", textAlign: "center" },
  errorTitle: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  stateText: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
