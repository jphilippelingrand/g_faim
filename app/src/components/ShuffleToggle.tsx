import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, fonts } from "../theme";

const TIP = "Mode surprise : 5 restos ouverts tirés au sort, bien notés ou pas. Pour sortir des sentiers battus.";

/** Interrupteur du mode surprise ; un appui long affiche une bulle d'explication. */
export function ShuffleToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const [tip, setTip] = useState(false);
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(false), 3000);
    return () => clearTimeout(t);
  }, [tip]);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.button, on && styles.buttonOn]}
        onPress={() => {
          setTip(false);
          Haptics.selectionAsync();
          onChange(!on);
        }}
        onLongPress={() => {
          setTip(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        delayLongPress={400}
        hitSlop={6}
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel="Mode surprise"
        accessibilityHint={TIP}
      >
        <Svg viewBox="0 0 24 24" width={22} height={22}>
          <Path
            fill={on ? colors.accent : colors.muted}
            d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
          />
        </Svg>
        {on && <View style={styles.dot} />}
      </Pressable>
      {tip && (
        <View style={styles.tip} pointerEvents="none">
          <View style={styles.tipArrow} />
          <Text style={styles.tipText}>{TIP}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, right: 0, zIndex: 2, alignItems: "flex-end" },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonOn: { borderColor: colors.accent },
  // Le petit point sous l'icône, comme dans Spotify
  dot: { position: "absolute", bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  tip: {
    marginTop: 8,
    width: 230,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.ink,
  },
  tipArrow: {
    position: "absolute",
    top: -6,
    right: 16,
    width: 12,
    height: 12,
    backgroundColor: colors.ink,
    transform: [{ rotate: "45deg" }],
  },
  tipText: { color: colors.bg, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
});
