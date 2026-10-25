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
const ROLL_MS = 650;
const FLIP_MS = 140;

type Props = {
  on: boolean;
  /** Bascule : 🎲 → tirage au sort, ⭐ → retour au classement par note. */
  onToggle: () => void;
  /** Haut du panneau (px depuis le haut de l'écran), fourni par la bottom sheet : le bouton le suit. */
  sheetTop: SharedValue<number>;
  screenHeight: number;
};

/**
 * Le bouton du mode surprise, posé sur la carte au-dessus du panneau. Deux faces :
 * 🎲 (toucher = le dé roule puis devient ⭐, restos tirés au sort) et ⭐ (toucher = il se retourne en 🎲,
 * retour au classement par note).
 */
export function DiceButton({ on, onToggle, sheetTop, screenHeight }: Props) {
  // La face affichée change en fin d'animation, pas au toucher : on voit le dé rouler avant de devenir ⭐.
  const [face, setFace] = useState(on ? "⭐" : "🎲");
  const swap = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(swap.current), []);

  const spin = useSharedValue(0);
  const flip = useSharedValue(1);
  const bounce = useSharedValue(1);

  const follow = useAnimatedStyle(() => ({
    top: sheetTop.value - SIZE - GAP,
    // Panneau ouvert en grand : la carte est cachée, le bouton s'efface.
    opacity: interpolate(sheetTop.value, [screenHeight * 0.2, screenHeight * 0.35], [0, 1], "clamp"),
  }));
  const anim = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 720}deg` }, { scaleX: flip.value }, { scale: bounce.value }],
  }));

  function press() {
    clearTimeout(swap.current);
    if (!on) {
      // 🎲 : le dé roule, puis devient ⭐.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      spin.set(0);
      spin.set(withTiming(1, { duration: ROLL_MS, easing: Easing.out(Easing.cubic) }));
      bounce.set(withSequence(withTiming(0.8, { duration: 90 }), withSpring(1, { damping: 6, stiffness: 220 })));
      swap.current = setTimeout(() => setFace("⭐"), ROLL_MS - 120);
    } else {
      // ⭐ : se retourne comme une carte, et redevient 🎲.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      flip.set(withSequence(withTiming(0, { duration: FLIP_MS }), withTiming(1, { duration: FLIP_MS })));
      swap.current = setTimeout(() => setFace("🎲"), FLIP_MS);
    }
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
