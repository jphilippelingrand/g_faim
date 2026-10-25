import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import { colors, fonts } from "../theme";

const SIZE = 84;
const GAP = 16;

type Props = {
  on: boolean;
  /** Toucher le dé : active le tirage au sort, ou relance s'il est déjà actif. */
  onRoll: () => void;
  onClose: () => void;
  /** Haut du panneau (px depuis le haut de l'écran), fourni par la bottom sheet : le dé le suit. */
  sheetTop: SharedValue<number>;
  screenHeight: number;
};

/** Le dé flottant du mode surprise, posé sur la carte juste au-dessus du panneau. */
export function DiceButton({ on, onRoll, onClose, sheetTop, screenHeight }: Props) {
  const spin = useSharedValue(0);
  const bounce = useSharedValue(1);

  const follow = useAnimatedStyle(() => ({
    top: sheetTop.value - SIZE - GAP,
    // Panneau ouvert en grand : la carte est cachée, le dé s'efface.
    opacity: interpolate(sheetTop.value, [screenHeight * 0.2, screenHeight * 0.35], [0, 1], "clamp"),
  }));
  const roll = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 720}deg` }, { scale: bounce.value }],
  }));

  function press() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // .set() plutôt que .value = … : compatible avec le compilateur React.
    spin.set(0);
    spin.set(withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    bounce.set(withSequence(withTiming(0.8, { duration: 90 }), withSpring(1, { damping: 6, stiffness: 220 })));
    onRoll();
  }

  return (
    <Animated.View style={[styles.wrap, follow]} pointerEvents="box-none">
      <Pressable
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={on ? t("reroll") : t("surpriseMode")}
        accessibilityHint={t("surpriseTip")}
      >
        <Animated.View style={[styles.dice, roll]}>
          <Text style={[styles.emoji, on && styles.emojiOn]}>🎲</Text>
        </Animated.View>
      </Pressable>
      {on && (
        <Pressable
          style={styles.close}
          onPress={() => {
            Haptics.selectionAsync();
            onClose();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("closeSurprise")}
        >
          <View>
            <Text style={styles.closeText}>×</Text>
          </View>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: GAP, width: SIZE, height: SIZE },
  // Juste le dé, sans fond : une ombre le garde lisible sur la carte, une lueur orange quand il est actif.
  dice: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  emoji: {
    fontSize: 64,
    textShadowColor: "rgba(43, 33, 28, 0.35)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 3 },
  },
  emojiOn: { textShadowColor: colors.accent, textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
  close: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: colors.bg, fontFamily: fonts.title, fontSize: 17, lineHeight: 19 },
});
