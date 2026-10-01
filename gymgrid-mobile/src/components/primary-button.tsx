import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";

import { colors } from "@/constants/colors";

interface PrimaryButtonProps {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger";
  style?: ViewStyle;
}

export function PrimaryButton({
  disabled = false,
  label,
  loading = false,
  onPress,
  tone = "primary",
  style,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[tone],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={tone === "secondary" ? colors.ink : colors.surface}
        />
      ) : (
        <Text
          style={[
            styles.label,
            tone === "secondary" && styles.secondaryLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: colors.accentDeep },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
  },
  danger: { backgroundColor: colors.danger },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
  label: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  secondaryLabel: { color: colors.ink },
});
