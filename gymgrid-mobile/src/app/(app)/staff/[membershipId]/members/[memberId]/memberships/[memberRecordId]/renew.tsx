import { router, type Href, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { formatGymDate, formatMoney } from "@/lib/staff-data";
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

interface SourceMembershipRow {
  id: string;
  member_id: string;
  branch_id: string;
  membership_plan_id: string;
  plan_name: string;
  enrollment_code: string;
  status: "active" | "scheduled" | "expired" | "frozen" | "cancelled";
  end_date: string;
}

interface PlanRow {
  id: string;
  code: string;
  name: string;
  duration_value: number;
  duration_unit: "day" | "week" | "month" | "year";
  price_amount_minor: number;
  joining_fee_amount_minor: number;
  currency: string;
}

interface RenewalResult {
  enrollment_code: string;
}

export default function StaffRenewMembershipScreen() {
  const { membershipId, memberId, memberRecordId } = useLocalSearchParams<{
    membershipId: string;
    memberId: string;
    memberRecordId: string;
  }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [source, setSource] = useState<SourceMembershipRow | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!workspace?.canManageMemberships) {
      setError("Your role cannot renew memberships in this workspace.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const sourceResult = await supabase
        .from("member_membership_statuses")
        .select(
          "id, member_id, branch_id, membership_plan_id, plan_name, enrollment_code, status, end_date",
        )
        .eq("organization_id", workspace.organization.id)
        .eq("member_id", memberId)
        .eq("id", memberRecordId)
        .maybeSingle();

      if (sourceResult.error) throw sourceResult.error;
      const sourceRow = sourceResult.data as SourceMembershipRow | null;
      if (!sourceRow || ["frozen", "cancelled"].includes(sourceRow.status)) {
        throw new Error("This membership is not available for renewal.");
      }

      const plansResult = await supabase
        .from("membership_plans")
        .select(
          "id, code, name, duration_value, duration_unit, price_amount_minor, joining_fee_amount_minor, currency",
        )
        .eq("organization_id", workspace.organization.id)
        .eq("active", true)
        .or(`branch_id.is.null,branch_id.eq.${sourceRow.branch_id}`)
        .order("name");

      if (plansResult.error) throw plansResult.error;
      const planRows = (plansResult.data ?? []) as PlanRow[];

      setSource(sourceRow);
      setPlans(planRows);
      setSelectedPlanId((current) =>
        current ||
        planRows.find((plan) => plan.id === sourceRow.membership_plan_id)?.id ||
        planRows[0]?.id ||
        "",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The renewal form could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [memberId, memberRecordId, setPlans, setSelectedPlanId, setSource, workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId),
    [plans, selectedPlanId],
  );

  const saveRenewal = async () => {
    if (!workspace || !source || !selectedPlan) return;

    if (startDate) {
      const parsed = new Date(`${startDate}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== startDate
      ) {
        setMessage("Use a valid start date in YYYY-MM-DD format, or leave it blank.");
        return;
      }
    }
    if (notes.length > 2000) {
      setMessage("Notes must be 2,000 characters or fewer.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const { data, error: renewalError } = await supabase.rpc(
        "renew_membership",
        {
          p_organization_id: workspace.organization.id,
          p_source_membership_id: source.id,
          p_membership_plan_id: selectedPlan.id,
          p_start_date: startDate || null,
          p_notes: notes.trim() || null,
        },
      );

      if (renewalError) throw renewalError;

      const result = (data as RenewalResult[] | null)?.[0];
      router.replace(
        `/staff/${workspace.membershipId}/members/${memberId}?renewed=${encodeURIComponent(result?.enrollment_code ?? "created")}` as Href,
      );
    } catch (cause) {
      const renewalError = cause as { code?: string; message?: string };
      if (renewalError.code === "23P01") {
        setMessage("The renewal overlaps another membership.");
      } else if (renewalError.code === "P0003") {
        setMessage("This gym has reached its active-member allowance.");
      } else if (renewalError.code === "42501") {
        setMessage("Your role cannot renew this membership.");
      } else if (["22007", "22023", "23503", "23514"].includes(renewalError.code ?? "")) {
        setMessage("The membership, plan, or start date is unavailable.");
      } else {
        setMessage(renewalError.message ?? "The membership could not be renewed.");
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
          <Text style={styles.eyebrow}>OWNER / STAFF · RENEWAL</Text>
          <Text style={styles.title}>Renew membership</Text>
          <Text style={styles.subtitle}>
            {source
              ? `${source.plan_name} · ends ${formatGymDate(source.end_date)}`
              : "Choose the next plan and optional start date."}
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
            <Text style={styles.stateText}>Loading renewal options…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Renewal unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void load()} />
          </View>
        ) : plans.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>No active plans</Text>
            <Text style={styles.stateText}>Activate a compatible plan in the web portal first.</Text>
          </View>
        ) : (
          <View style={styles.formCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>RENEWAL PLAN *</Text>
              <View style={styles.planList}>
                {plans.map((plan) => (
                  <Pressable
                    key={plan.id}
                    onPress={() => setSelectedPlanId(plan.id)}
                    style={[
                      styles.planChoice,
                      selectedPlanId === plan.id && styles.planChoiceSelected,
                    ]}
                  >
                    <View style={styles.planCopy}>
                      <Text style={[styles.planName, selectedPlanId === plan.id && styles.planTextSelected]}>{plan.name}</Text>
                      <Text style={[styles.planMeta, selectedPlanId === plan.id && styles.planMetaSelected]}>
                        {plan.duration_value} {plan.duration_unit}{plan.duration_value === 1 ? "" : "s"} · {formatMoney(plan.price_amount_minor + plan.joining_fee_amount_minor, plan.currency)} total
                      </Text>
                    </View>
                    <Text style={[styles.planCode, selectedPlanId === plan.id && styles.planTextSelected]}>{plan.code}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>START DATE</Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                onChangeText={setStartDate}
                placeholder="Automatic next valid date"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
                value={startDate}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>NOTES</Text>
              <TextInput
                multiline
                onChangeText={setNotes}
                placeholder="Optional renewal notes"
                placeholderTextColor={colors.inkMuted}
                style={[styles.input, styles.multiline]}
                value={notes}
              />
            </View>
            <PrimaryButton
              disabled={!selectedPlan}
              label="Create renewal"
              loading={isSaving}
              onPress={() => void saveRenewal()}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { alignSelf: "center", maxWidth: 680, padding: 22, paddingBottom: 44, width: "100%" },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  backText: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  heading: { marginBottom: 24, marginTop: 40 },
  eyebrow: { color: colors.accentDark, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 7 },
  subtitle: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 9 },
  messageCard: { backgroundColor: colors.dangerSoft, borderRadius: 14, marginBottom: 14, padding: 14 },
  messageText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  formCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 22, borderWidth: 1, gap: 20, padding: 20 },
  fieldGroup: { gap: 8 },
  label: { color: colors.inkMuted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  planList: { gap: 9 },
  planChoice: { alignItems: "center", backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 12, padding: 14 },
  planChoiceSelected: { backgroundColor: colors.accentDeep, borderColor: colors.accentDeep },
  planCopy: { flex: 1 },
  planName: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  planMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 4 },
  planMetaSelected: { color: colors.accentSoft },
  planCode: { color: colors.accentDark, fontSize: 10, fontWeight: "900" },
  planTextSelected: { color: colors.surface },
  input: { backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 13, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  centerState: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, gap: 14, padding: 28 },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", textAlign: "center" },
  errorTitle: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  stateText: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
