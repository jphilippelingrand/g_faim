import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Keyframe, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";
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

// Le panneau sort du bouton (coin haut droit).
const OPEN = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.7 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(170);
const CLOSE = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.9 }] },
}).duration(110);

/**
 * Le bouton « ⋯ » de la vue principale et son panneau : la vue (swipe ou liste, en deux segments) et un
 * interrupteur pour montrer aussi les restos fermés. Les réglages s'appliquent tout de suite ; un tap à côté
 * ferme le panneau.
 */
export function MainMenu({ top, viewMode, onViewMode, showClosed, onShowClosed }: Props) {
  const [open, setOpen] = useState(false);

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
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Circle cx={4} cy={10} r={1.9} fill={colors.ink} />
          <Circle cx={10} cy={10} r={1.9} fill={colors.ink} />
          <Circle cx={16} cy={10} r={1.9} fill={colors.ink} />
        </Svg>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel={t("cancel")} />
        {open && (
          <Animated.View entering={OPEN} exiting={CLOSE} style={[styles.panel, { top }]}>
            <View style={styles.segments} accessibilityRole="tablist">
              {(["cards", "list"] as const).map((mode) => {
                const on = viewMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[styles.segment, on && styles.segmentOn]}
                    onPress={() => {
                      if (on) return;
                      Haptics.selectionAsync();
                      onViewMode(mode);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    {mode === "cards" ? <CardsIcon on={on} /> : <ListIcon on={on} />}
                    <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t(mode === "cards" ? "modeCards" : "modeList")}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                Haptics.selectionAsync();
                onShowClosed(!showClosed);
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: showClosed }}
            >
              <MoonIcon />
              <Text style={styles.rowText}>{t("showClosed")}</Text>
              <Switch on={showClosed} />
            </Pressable>
          </Animated.View>
        )}
      </Modal>
    </>
  );
}

/** Un interrupteur façon iOS, en couleur de la marque ; il glisse quand on change. */
function Switch({ on }: { on: boolean }) {
  const x = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    x.value = withTiming(on ? 1 : 0, { duration: 160 });
  }, [on, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 18 }] }));
  return (
    <View style={[styles.switch, on && styles.switchOn]}>
      <Animated.View style={[styles.knob, knob]} />
    </View>
  );
}

const ink = (on: boolean) => (on ? colors.accent : colors.muted);

function CardsIcon({ on }: { on: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Rect x={5} y={2} width={10} height={13} rx={2.5} fill="none" stroke={ink(on)} strokeWidth={1.6} opacity={0.5} />
      <Rect x={2.5} y={4} width={10} height={13} rx={2.5} fill={on ? colors.accentSoft : "none"} stroke={ink(on)} strokeWidth={1.6} />
    </Svg>
  );
}

function ListIcon({ on }: { on: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path d="M3 5h12M3 9h12M3 13h12" stroke={ink(on)} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function MoonIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path d="M14.5 11.2A6 6 0 0 1 6.8 3.5a6 6 0 1 0 7.7 7.7Z" fill="none" stroke={colors.ink} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
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
  panel: {
    position: "absolute",
    right: 12,
    width: 264,
    padding: 8,
    gap: 6,
    borderRadius: 22,
    backgroundColor: colors.card,
    transformOrigin: "top right",
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },
  segments: { flexDirection: "row", padding: 3, borderRadius: 14, backgroundColor: colors.bg },
  segment: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 11 },
  segmentOn: {
    backgroundColor: colors.card,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  segmentText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  segmentTextOn: { color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12 },
  rowPressed: { backgroundColor: colors.bg },
  rowText: { flex: 1, fontFamily: fonts.medium, fontSize: 14.5, color: colors.ink },
  switch: { width: 42, height: 24, borderRadius: 12, padding: 2, backgroundColor: colors.line },
  switchOn: { backgroundColor: colors.accent },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
});
