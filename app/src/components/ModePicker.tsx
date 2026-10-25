import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

/** Ce qu'on cherche : le top par note, de quoi manger vite tout près, ou un tirage au sort. */
export type Mode = "top" | "fast" | "surprise";

export const MODES: Mode[] = ["top", "fast", "surprise"];

const OPTIONS: { mode: Mode; emoji: string; label: "modeTop" | "modeFast" | "modeSurprise" }[] = [
  { mode: "top", emoji: "⭐", label: "modeTop" },
  { mode: "fast", emoji: "⚡", label: "modeFast" },
  { mode: "surprise", emoji: "🎲", label: "modeSurprise" },
];

const SIZE = 36;

/**
 * Trois choix exclusifs dans le bandeau, en emojis seuls comme la barre compacte du site.
 * Au changement (ou à l'appui long), le nom du mode s'affiche un instant dessous.
 */
export function ModePicker({ mode, onChange, style }: { mode: Mode; onChange: (mode: Mode) => void; style?: StyleProp<ViewStyle> }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!label) return;
    const timer = setTimeout(() => setLabel(null), 1600);
    return () => clearTimeout(timer);
  }, [label]);

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.pill} accessibilityRole="radiogroup" accessibilityLabel={t("modeLabel")}>
        {OPTIONS.map((o) => {
          const on = mode === o.mode;
          return (
            <Pressable
              key={o.mode}
              style={[styles.option, on && styles.optionOn]}
              onPress={() => {
                setLabel(t(o.label));
                if (on) return;
                Haptics.selectionAsync();
                onChange(o.mode);
              }}
              onLongPress={() => setLabel(t(o.label))}
              hitSlop={4}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t(o.label)}
            >
              <Text style={[styles.emoji, !on && styles.emojiOff]}>{o.emoji}</Text>
            </Pressable>
          );
        })}
      </View>
      {label && (
        <View style={styles.tip} pointerEvents="none">
          <Text style={styles.tipText}>{label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 2, alignItems: "flex-start" },
  pill: {
    flexDirection: "row",
    padding: 2,
    gap: 2,
    borderRadius: SIZE / 2 + 2,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  option: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: "center", justifyContent: "center" },
  optionOn: { backgroundColor: colors.accentSoft },
  emoji: { fontSize: 18 },
  // Les modes non choisis en retrait, comme sur le site.
  emojiOff: { opacity: 0.45 },
  tip: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.ink },
  tipText: { color: colors.bg, fontFamily: fonts.body, fontSize: 13 },
});
