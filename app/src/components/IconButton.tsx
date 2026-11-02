import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { colors } from "../theme";

/**
 * Le petit bouton rond à icône, le même partout (↗ ouvrir dans les cartes, partager, supprimer) : discret,
 * pour que l'écran reste lisible.
 */
export function IconButton({ label, onPress, busy, children }: { label: string; onPress: () => void; busy?: boolean; children: ReactNode }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
      disabled={busy}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  pressed: { backgroundColor: colors.accentSoft, transform: [{ scale: 0.94 }] },
});
