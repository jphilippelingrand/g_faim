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
  // Rond pêche, icône rouge : les couleurs de la marque, assez gros pour le pouce.
  button: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.7, transform: [{ scale: 0.92 }] },
});
