import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Keyframe } from "react-native-reanimated";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

export type ViewMode = "cards" | "list";

type Props = {
  /** Où poser le menu : sous le bouton, aligné à droite. */
  top: number;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  showClosed: boolean;
  onShowClosed: (show: boolean) => void;
};

// Le menu sort du bouton (coin haut droit), comme un menu iOS.
const OPEN = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.6 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(180);
const CLOSE = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.8 }] },
}).duration(120);

/**
 * Le bouton « ⋯ » de la vue principale et son menu, à la façon des menus d'iOS : la vue (swipe ou liste) et
 * les restos fermés (cachés par défaut). Un choix ferme le menu.
 */
export function MainMenu({ top, viewMode, onViewMode, showClosed, onShowClosed }: Props) {
  const [open, setOpen] = useState(false);

  const choose = (action: () => void) => {
    Haptics.selectionAsync();
    action();
    setOpen(false);
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.button, (pressed || open) && styles.buttonOn]}
        onPress={() => {
          Haptics.selectionAsync();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={t("menu")}
      >
        <Text style={styles.dots}>•••</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel={t("cancel")} />
        {open && (
          <Animated.View entering={OPEN} exiting={CLOSE} style={[styles.menu, { top }]} accessibilityRole="menu">
            <Text style={styles.section}>{t("menuView")}</Text>
            <Item label={t("modeCards")} icon="❤️" checked={viewMode === "cards"} onPress={() => choose(() => onViewMode("cards"))} />
            <View style={styles.line} />
            <Item label={t("modeList")} icon="☰" checked={viewMode === "list"} onPress={() => choose(() => onViewMode("list"))} />
            <View style={styles.gap} />
            <Item label={t("showClosed")} icon="🌙" checked={showClosed} onPress={() => choose(() => onShowClosed(!showClosed))} />
          </Animated.View>
        )}
      </Modal>
    </>
  );
}

function Item({ label, icon, checked, onPress }: { label: string; icon: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ checked }}
    >
      <Text style={styles.check}>{checked ? "✓" : ""}</Text>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.icon, icon === "☰" && styles.iconLines]}>{icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 246, 239, 0.94)",
    shadowColor: colors.ink,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  buttonOn: { backgroundColor: colors.accentSoft },
  dots: { fontSize: 11, letterSpacing: 1, color: colors.ink, marginLeft: 1 },
  menu: {
    position: "absolute",
    right: 12,
    width: 250,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(251, 246, 239, 0.98)",
    transformOrigin: "top right",
    shadowColor: colors.ink,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  section: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  item: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingLeft: 10, paddingRight: 16 },
  itemPressed: { backgroundColor: colors.line },
  check: { width: 22, fontFamily: fonts.title, fontSize: 15, color: colors.accent, textAlign: "center" },
  label: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink, marginLeft: 4 },
  icon: { fontSize: 16 },
  // ☰ est un caractère, pas un emoji : même taille et couleur d'encre que ses voisins.
  iconLines: { fontSize: 18, color: colors.ink },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 36 },
  // Entre deux groupes, une bande plus épaisse, comme dans les menus d'iOS.
  gap: { height: 7, backgroundColor: colors.line, opacity: 0.6, marginVertical: 2 },
});
