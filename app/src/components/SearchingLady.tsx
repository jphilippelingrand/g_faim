import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Lady } from "./Lady";

type Props = {
  /** Recherche en cours : la dame apparaît, puis s'efface quand les restos arrivent. */
  visible: boolean;
  surprise: boolean;
  /** Zone visible de la carte, entre le bandeau du haut et le panneau. */
  top: number;
  bottom: number;
};

/** La dame en grand au milieu de la carte, le ventre qui gargouille, seulement pendant la recherche. */
export function SearchingLady({ visible, surprise, top, bottom }: Props) {
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    opacity.set(withTiming(visible ? 1 : 0, { duration: visible ? 200 : 450 }));
  }, [visible, opacity]);

  const fade = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: 0.92 + 0.08 * opacity.value }],
  }));

  return (
    <Animated.View style={[styles.zone, { top, bottom }, fade]} pointerEvents="none">
      <View style={styles.halo}>
        <Lady mood="starving" surprise={surprise} width={170} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  zone: { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "center" },
  // Un halo crème pour qu'elle se détache de la carte.
  halo: {
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(251, 246, 239, 0.88)",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 16,
  },
});
