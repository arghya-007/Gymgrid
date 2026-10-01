import { router, type Href, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
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
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

interface CreateMemberResult {
  member_id: string;
  member_code: string;
}

export default function StaffNewMemberScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [branchId, setBranchId] = useState(workspace?.branches[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = useMemo(
    () =>
      Boolean(
        workspace?.canManageMembers &&
          branchId &&
          fullName.trim().length >= 2 &&
          phone.replace(/\D/g, "").length >= 10,
      ),
    [branchId, fullName, phone, workspace],
  );

  const saveMember = async () => {
    if (!workspace || !canSubmit) {
      setMessage("Enter a name, a valid phone number, and choose a branch.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setMessage("Enter a valid email address or leave it blank.");
      return;
    }
    if (notes.length > 2000) {
      setMessage("Notes must be 2,000 characters or fewer.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc("create_member", {
        p_organization_id: workspace.organization.id,
        p_home_branch_id: branchId,
        p_full_name: fullName.trim(),
        p_phone: phone.trim(),
        p_email: cleanEmail || null,
        p_preferred_name: preferredName.trim() || null,
        p_date_of_birth: null,
        p_gender: null,
        p_notes: notes.trim() || null,
      });

      if (error) throw error;

      const result = (data as CreateMemberResult[] | null)?.[0];
      if (!result) throw new Error("The member was created without an identifier.");

      router.replace(
        `/staff/${workspace.membershipId}/members/${result.member_id}?created=${encodeURIComponent(result.member_code)}` as Href,
      );
    } catch (cause) {
      const error = cause as { code?: string; message?: string };
      if (error.code === "42501") {
        setMessage("Your role cannot add a member to that branch.");
      } else if (["22023", "23514"].includes(error.code ?? "")) {
        setMessage("Review the member name, phone, email, branch, and notes.");
      } else {
        setMessage(error.message ?? "The member could not be created.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!workspace || !workspace.hasStaffMode) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Workspace unavailable</Text>
          <PrimaryButton label="Back" onPress={() => router.replace("/")} />
        </View>
      </SafeAreaView>
    );
  }

  if (!workspace.canManageMembers) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Member creation unavailable</Text>
          <Text style={styles.stateText}>
            Your current role can view members but cannot add them.
          </Text>
          <PrimaryButton label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <Brand compact />
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>Cancel</Text>
          </Pressable>
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>OWNER / STAFF · NEW MEMBER</Text>
          <Text style={styles.title}>Add a member</Text>
          <Text style={styles.subtitle}>
            Create the contact record first. You can enrol the member immediately afterward.
          </Text>
        </View>

        {message && (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        <View style={styles.formCard}>
          <Field
            autoCapitalize="words"
            label="Full name *"
            onChangeText={setFullName}
            placeholder="e.g. Ananya Sharma"
            value={fullName}
          />
          <Field
            autoCapitalize="words"
            label="Preferred name"
            onChangeText={setPreferredName}
            placeholder="Optional"
            value={preferredName}
          />
          <Field
            keyboardType="phone-pad"
            label="Phone *"
            onChangeText={setPhone}
            placeholder="10-digit India mobile or international number"
            value={phone}
          />
          <Field
            autoCapitalize="none"
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="Optional"
            value={email}
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>HOME BRANCH *</Text>
            <View style={styles.choiceList}>
              {workspace.branches.map((branch) => (
                <Pressable
                  key={branch.id}
                  onPress={() => setBranchId(branch.id)}
                  style={[
                    styles.choice,
                    branchId === branch.id && styles.choiceSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      branchId === branch.id && styles.choiceTextSelected,
                    ]}
                  >
                    {branch.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Field
            label="Notes"
            multiline
            onChangeText={setNotes}
            placeholder="Optional health or onboarding notes"
            value={notes}
          />

          <PrimaryButton
            disabled={!canSubmit}
            label="Create member"
            loading={isSaving}
            onPress={() => void saveMember()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  multiline = false,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <TextInput
        multiline={multiline}
        placeholderTextColor={colors.inkMuted}
        style={[styles.input, multiline && styles.multiline]}
        {...props}
      />
    </View>
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
  subtitle: { color: colors.inkMuted, fontSize: 15, lineHeight: 22, marginTop: 9 },
  messageCard: { backgroundColor: colors.dangerSoft, borderRadius: 14, marginBottom: 14, padding: 14 },
  messageText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  fieldGroup: { gap: 7 },
  label: { color: colors.inkMuted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  input: {
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: 13,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  choiceList: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  choice: { backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  choiceSelected: { backgroundColor: colors.accentDeep, borderColor: colors.accentDeep },
  choiceText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  choiceTextSelected: { color: colors.surface },
  centerState: { alignItems: "center", gap: 14, justifyContent: "center", minHeight: "100%", padding: 28 },
  stateTitle: { color: colors.ink, fontSize: 22, fontWeight: "900", textAlign: "center" },
  stateText: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
