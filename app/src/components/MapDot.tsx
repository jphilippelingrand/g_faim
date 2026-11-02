import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from "react-native-reanimated";
import { colors } from "../theme";

/**
 * Un resto sur la carte : point gris ; rouge s'il est choisi (« picked », la sélection d'un vote) ; et celui
 * qu'on regarde (« selected ») plus gros, qui apparaît d'un petit rebond puis respire doucement (un halo qui
 * s'élargit et s'efface).
 */
export function MapDot({ state }: { state: "idle" | "picked" | "selected" }) {
  if (state !== "selected") return <View style={[styles.dot, state === "picked" && styles.picked]} />;
  return <SelectedDot />;
}

// Le halo : une respiration toutes les 1,8 s.
const PULSE_MS = 1800;

function SelectedDot() {
  const pop = useSharedValue(0.6);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pop.value = withSpring(1, { damping: 7, stiffness: 260 });
    pulse.value = withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pop, pulse]);

  const halo = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - pulse.value), transform: [{ scale: 1 + 1.2 * pulse.value }] }));
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <View style={styles.frame}>
      <Animated.View style={[styles.halo, halo]} />
      <Animated.View style={[styles.dot, styles.selected, dot]} />
    </View>
  );
}

const SELECTED = 30;

const styles = StyleSheet.create({
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.muted, borderWidth: 2.5, borderColor: "#fff" },
  picked: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent },
  // De la place autour pour le halo (le marqueur est centré sur le resto).
  frame: { width: SELECTED * 2.4, height: SELECTED * 2.4, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: SELECTED, height: SELECTED, borderRadius: SELECTED / 2, backgroundColor: colors.accent },
  selected: { width: SELECTED, height: SELECTED, borderRadius: SELECTED / 2, borderWidth: 3.5, backgroundColor: colors.accent },
});
