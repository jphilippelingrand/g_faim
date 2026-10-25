import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { lang, t } from "../i18n";
import { colors, fonts } from "../theme";
import { Lady, type Mood } from "./Lady";

const SITE = "https://www.groubl.com";

type Props = {
  mood: Mood;
  surprise: boolean;
  onSurprise: (on: boolean) => void;
  onReroll: () => void;
  /** Où ouvrir le menu, sous la dame (hauteur de la barre du haut, encoche comprise). */
  top: number;
};

/** La petite dame en haut à gauche : la toucher ouvre un menu (mode surprise, liens). */
export function LadyMenu({ mood, surprise, onSurprise, onReroll, top }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={styles.button}>
        <Lady mood={mood} surprise={surprise} width={58} onPress={() => setOpen(true)} accessibilityLabel={t("menu")} />
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t("menu")}>
          {/* Le toucher sur la carte du menu ne doit pas la refermer : Pressable vide qui absorbe. */}
          <Pressable style={[styles.card, { top }]} onPress={() => {}}>
            <Text style={styles.title}>{t("appName")}</Text>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t("surpriseMode")}</Text>
              <Switch
                value={surprise}
                onValueChange={(on) => {
                  Haptics.selectionAsync();
                  onSurprise(on);
                }}
                trackColor={{ true: colors.accent, false: colors.line }}
                accessibilityLabel={t("surpriseMode")}
              />
            </View>
            <Text style={styles.hint}>{t("surpriseTip")}</Text>
            {surprise && (
              <Pressable
                style={({ pressed }) => [styles.reroll, pressed && styles.pressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onReroll();
                  setOpen(false);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.rerollText}>↻ {t("reroll")}</Text>
              </Pressable>
            )}

            <View style={styles.divider} />
            <Pressable onPress={() => Linking.openURL(`${SITE}/${lang}/privacy`)} accessibilityRole="link" hitSlop={6}>
              <Text style={styles.link}>{t("privacy")}</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(`${SITE}/${lang}/support`)} accessibilityRole="link" hitSlop={6}>
              <Text style={styles.link}>{t("support")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(251, 246, 239, 0.95)",
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    shadowColor: colors.ink,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  backdrop: { flex: 1, backgroundColor: "rgba(43, 33, 28, 0.18)" },
  card: {
    position: "absolute",
    left: 16,
    width: 280,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.bg,
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  title: { fontFamily: fonts.title, fontSize: 20, color: colors.ink, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 6 },
  reroll: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rerollText: { fontFamily: fonts.medium, fontSize: 14, color: colors.accent },
  pressed: { opacity: 0.7 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  link: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, paddingVertical: 6 },
});
