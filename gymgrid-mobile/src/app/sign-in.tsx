import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
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
import { useAuth } from "@/providers/auth-provider";

export default function SignInScreen() {
  const { isConfigured, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      setError(await signIn(email, password));
    } catch {
      setError("Authentication is temporarily unavailable. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Brand />
            <Text style={styles.eyebrow}>ONE ACCOUNT. EVERY WORKSPACE.</Text>
            <Text style={styles.title}>Run your gym or train as a member.</Text>
            <Text style={styles.subtitle}>
              Sign in to the workspace your gym has assigned to you.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome back</Text>
            <Text style={styles.cardSubtitle}>Use your GymGrid email and password.</Text>

            {!isConfigured && (
              <View style={styles.warning}>
                <Text style={styles.warningTitle}>Local setup required</Text>
                <Text style={styles.warningText}>
                  Copy .env.example to .env.local and add the development Supabase public values.
                </Text>
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                editable={!isSubmitting}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
                value={email}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!isSubmitting}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={colors.inkMuted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <PrimaryButton
              disabled={!email.trim() || !password || !isConfigured}
              label="Sign in"
              loading={isSubmitting}
              onPress={() => void handleSignIn()}
            />
          </View>

          <Text style={styles.footer}>
            GymGrid uses your gym&apos;s access rules to keep each organization isolated.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  flex: { flex: 1 },
  content: {
    alignSelf: "center",
    flexGrow: 1,
    justifyContent: "center",
    maxWidth: 560,
    padding: 24,
    width: "100%",
  },
  hero: { marginBottom: 30 },
  eyebrow: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 30,
  },
  title: {
    color: colors.ink,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.3,
    lineHeight: 43,
    marginTop: 10,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 17,
    lineHeight: 25,
    marginTop: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 18,
    padding: 22,
  },
  cardTitle: { color: colors.ink, fontSize: 24, fontWeight: "900" },
  cardSubtitle: { color: colors.inkMuted, fontSize: 15, marginTop: -10 },
  warning: {
    backgroundColor: colors.warningSoft,
    borderRadius: 14,
    padding: 14,
  },
  warningTitle: { color: colors.warning, fontSize: 14, fontWeight: "800" },
  warningText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  fieldGroup: { gap: 8 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  error: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
  },
  footer: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 22,
    textAlign: "center",
  },
});
