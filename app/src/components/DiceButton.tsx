import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { t } from "../i18n";

const SIZE = 84;
const GAP = 16;
// Le changement de face se fait quand l'emoji est minuscule et tourne vite : invisible.
const OUT_MS = 300; // tourne en accélérant et rétrécit
const IN_MS = 350; // la nouvelle face jaillit avec un petit rebond

type Props = {
  on: boolean;
  /** Bascule : 🎲 → tirage au sort, ⭐ → retour au classement par note. */
  onToggle: () => void;
  /** Haut du panneau (px depuis le haut de l'écran), fourni par la bottom sheet : le bouton le suit. */
  sheetTop: SharedValue<number>;
  screenHeight: number;
};

/**
 * Le bouton du mode surprise, posé sur la carte au-dessus du panneau. Deux faces : 🎲 (toucher = restos
 * tirés au sort) et ⭐ (toucher = retour au classement par note). Au toucher, la face tourne en accélérant
 * et rétrécit, change quand elle est minuscule, puis la nouvelle jaillit avec un rebond.
 */
export function DiceButton({ on, onToggle, sheetTop, screenHeight }: Props) {
  // La face affichée change au milieu de l'animation, quand elle est presque invisible.
  const [face, setFace] = useState(on ? "⭐" : "🎲");
  const swap = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(swap.current), []);

  const spin = useSharedValue(0);
  const scale = useSharedValue(1);
  const direction = useSharedValue(1);

  const follow = useAnimatedStyle(() => ({
    top: sheetTop.value - SIZE - GAP,
    // Panneau ouvert en grand : la carte est cachée, le bouton s'efface.
    opacity: interpolate(sheetTop.value, [screenHeight * 0.2, screenHeight * 0.35], [0, 1], "clamp"),
  }));
  const anim = useAnimatedStyle(() => ({
    transform: [{ rotate: `${direction.value * spin.value * 720}deg` }, { scale: scale.value }],
  }));

  function press() {
    clearTimeout(swap.current);
    const next = on ? "🎲" : "⭐";
    // 🎲 → ⭐ tourne dans un sens, ⭐ → 🎲 dans l'autre.
    direction.set(on ? -1 : 1);
    spin.set(0);
    spin.set(
      withSequence(
        withTiming(0.75, { duration: OUT_MS, easing: Easing.in(Easing.quad) }),
        withTiming(1, { duration: IN_MS, easing: Easing.out(Easing.cubic) }),
      ),
    );
    scale.set(
      withSequence(
        withTiming(0.1, { duration: OUT_MS, easing: Easing.in(Easing.quad) }),
        withSpring(1, { damping: 7, stiffness: 220 }),
      ),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    swap.current = setTimeout(() => {
      setFace(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, OUT_MS);
    onToggle();
  }

  return (
    <Animated.View style={[styles.wrap, follow]} pointerEvents="box-none">
      <Pressable
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={on ? t("closeSurprise") : t("surpriseMode")}
        accessibilityHint={on ? undefined : t("surpriseTip")}
      >
        <Animated.View style={[styles.face, anim]}>
          <Text style={styles.emoji}>{face}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: GAP, width: SIZE, height: SIZE },
  // Juste l'emoji, sans fond : une ombre le garde lisible sur la carte.
  face: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  emoji: {
    fontSize: 64,
    textShadowColor: "rgba(43, 33, 28, 0.35)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 3 },
  },
});
