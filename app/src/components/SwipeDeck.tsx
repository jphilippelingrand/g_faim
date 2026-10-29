import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Linking, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { PlaceCard } from "./PlaceCard";
import { directionsUrl, distanceMeters, shareUrl, travelTime, type LatLng, type Restaurant } from "../lib/places";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

type Props = {
  places: Restaurant[];
  home: LatLng;
  current: number;
  onChange: (index: number) => void;
};

// Au-delà de cette distance, la carte part ; sinon elle revient.
const THRESHOLD = 90;
const FLY_MS = 240;

/**
 * Le paquet de cartes, façon Tinder (comme src/components/SwipeDeck.tsx du site) : à gauche, « nan »,
 * la suivante (et on reboucle après la dernière) ; à droite, « miam », l'itinéraire dans Plans.
 * Les boutons ✕ et ♥ font la même chose, pour qui ne glisse pas.
 */
export function SwipeDeck({ places, home, current, onChange }: Props) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);

  const place = places[current];
  const next = places[(current + 1) % places.length];
  const trip = travelTime(distanceMeters(home, place.location));

  // Nouvelle carte du dessus : elle part du centre.
  useEffect(() => {
    x.set(0);
  }, [current, place.id, x]);

  const nextCard = () => onChange((current + 1) % places.length);
  const go = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Linking.openURL(directionsUrl(place, trip.mode === "walk"));
  };
  const share = () =>
    Share.share({ message: `${t("shareText", { name: place.name, minutes: trip.minutes })} ${shareUrl(place)}` });

  function fly(direction: "left" | "right") {
    Haptics.selectionAsync();
    if (direction === "right") go();
    x.set(
      withTiming(direction === "left" ? -width * 1.3 : width * 1.3, { duration: FLY_MS }, (done) => {
        if (!done) return;
        if (direction === "left") scheduleOnRN(nextCard);
        else x.set(withSpring(0));
      }),
    );
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      x.set(e.translationX);
    })
    .onEnd((e) => {
      if (e.translationX < -THRESHOLD) scheduleOnRN(fly, "left");
      else if (e.translationX > THRESHOLD) scheduleOnRN(fly, "right");
      else x.set(withSpring(0));
    });

  const top = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${x.value / 18}deg` }],
  }));
  const nope = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-THRESHOLD, 0], [1, 0], "clamp") }));
  const yum = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, THRESHOLD], [0, 1], "clamp") }));
  const behind = useAnimatedStyle(() => {
    const progress = interpolate(Math.abs(x.value), [0, width], [0, 1], "clamp");
    return { opacity: 0.6 + 0.4 * progress, transform: [{ scale: 0.95 + 0.05 * progress }, { translateY: 8 - 8 * progress }] };
  });

  return (
    <View>
      <View>
        {places.length > 1 && (
          <Animated.View style={[styles.behind, behind]} pointerEvents="none">
            <PlaceCard r={next} distance={distanceMeters(home, next.location)} />
          </Animated.View>
        )}
        <GestureDetector gesture={pan}>
          <Animated.View style={top}>
            {/* Un simple tap sur la carte : on y va, comme ♥. */}
            <Pressable onPress={() => fly("right")} accessibilityRole="link" accessibilityLabel={t("directionsTo", { name: place.name })}>
              <PlaceCard r={place} distance={distanceMeters(home, place.location)} />
            </Pressable>
            <Animated.Text style={[styles.stamp, styles.stampNope, nope]}>{t("nope")}</Animated.Text>
            <Animated.Text style={[styles.stamp, styles.stampYum, yum]}>{t("yum")}</Animated.Text>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.actions}>
        <Pressable style={({ pressed }) => [styles.round, pressed && styles.pressed]} onPress={() => fly("left")} accessibilityLabel={t("next")} accessibilityRole="button">
          <Text style={styles.cross}>✕</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.round, styles.small, pressed && styles.pressed]} onPress={share} accessibilityLabel={t("share")} accessibilityRole="button">
          <Svg viewBox="0 0 24 24" width={20} height={20}>
            <Path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.round, styles.heart, pressed && styles.pressed]}
          onPress={() => fly("right")}
          accessibilityLabel={t("directionsTo", { name: place.name })}
          accessibilityRole="link"
        >
          <Text style={styles.heartText}>♥</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: { position: "absolute", left: 0, right: 0, top: 0 },
  stamp: {
    position: "absolute",
    alignSelf: "center",
    top: 34,
    paddingHorizontal: 10,
    borderWidth: 3,
    borderRadius: 8,
    backgroundColor: colors.card,
    fontFamily: fonts.title,
    fontSize: 26,
    letterSpacing: 1,
    overflow: "hidden",
  },
  stampNope: { color: colors.muted, borderColor: colors.muted, transform: [{ rotate: "12deg" }] },
  stampYum: { color: colors.accent, borderColor: colors.accent, transform: [{ rotate: "-12deg" }] },
  actions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18, marginTop: 14 },
  round: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  small: { width: 46, height: 46, borderRadius: 23 },
  heart: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { transform: [{ scale: 0.92 }] },
  cross: { fontSize: 24, color: colors.muted },
  heartText: { fontSize: 30, color: "#fff" },
});
