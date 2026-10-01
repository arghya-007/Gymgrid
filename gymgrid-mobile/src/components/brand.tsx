import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/colors";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={[styles.mark, compact && styles.compactMark]}>
        <Text style={[styles.markText, compact && styles.compactMarkText]}>G</Text>
      </View>
      <Text style={[styles.name, compact && styles.compactName]}>GymGrid</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: 12 },
  mark: {
    alignItems: "center",
    backgroundColor: colors.accentDeep,
    borderRadius: 18,
    height: 58,
    justifyContent: "center",
    transform: [{ rotate: "-4deg" }],
    width: 58,
  },
  compactMark: { borderRadius: 11, height: 38, width: 38 },
  markText: { color: colors.surface, fontSize: 30, fontWeight: "900" },
  compactMarkText: { fontSize: 20 },
  name: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  compactName: { fontSize: 23, letterSpacing: -0.6 },
});
