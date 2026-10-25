import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet } from "react-native";
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { t } from "../i18n";
import { colors } from "../theme";
import { DICE_SIZE, DiceButton } from "./DiceButton";

const GAP = 16;
const RECENTER = 48;

type Props = {
  surprise: boolean;
  onToggleSurprise: () => void;
  onRecenter: () => void;
  /** Haut du panneau (px depuis le haut de l'écran), fourni par la bottom sheet : les boutons le suivent. */
  sheetTop: SharedValue<number>;
  screenHeight: number;
};

/** Les boutons posés sur la carte, à droite, juste au-dessus du panneau : recentrer ➤, puis le dé. */
export function MapControls({ surprise, onToggleSurprise, onRecenter, sheetTop, screenHeight }: Props) {
  const follow = useAnimatedStyle(() => ({
    top: sheetTop.value - RECENTER - 8 - DICE_SIZE - GAP,
    // Panneau ouvert en grand : la carte est cachée, les boutons s'effacent.
    opacity: interpolate(sheetTop.value, [screenHeight * 0.2, screenHeight * 0.35], [0, 1], "clamp"),
  }));

  return (
    <Animated.View style={[styles.column, follow]} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.recenter, pressed && styles.pressed]}
        onPress={() => {
          Haptics.selectionAsync();
          onRecenter();
        }}
        accessibilityRole="button"
        accessibilityLabel={t("recenter")}
        hitSlop={6}
      >
        {/* La flèche « ma position » des apps de carte */}
        <Svg viewBox="0 0 24 24" width={22} height={22}>
          <Path d="M20.5 3.5 3 11.2l7.4 2.4 2.4 7.4z" fill={colors.accent} />
        </Svg>
      </Pressable>
      <DiceButton on={surprise} onToggle={onToggleSurprise} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  column: { position: "absolute", right: GAP - (DICE_SIZE - RECENTER) / 2, alignItems: "center", gap: 8 },
  recenter: {
    width: RECENTER,
    height: RECENTER,
    borderRadius: RECENTER / 2,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pressed: { opacity: 0.7 },
});
