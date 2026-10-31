import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Platform, Pressable, Settings, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { PlaceCard } from "./PlaceCard";
import { distanceMeters, type LatLng, type Restaurant } from "../lib/places";
import { getMapsApp, openPlace, type MapsApp } from "../lib/mapsApp";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

type Props = {
  places: Restaurant[];
  home: LatLng;
  current: number;
  onChange: (index: number) => void;
  /** Il en reste plus loin : on les demande un peu avant la fin du paquet. */
  hasMore: boolean;
  loadingMore: boolean;
  onNeedMore: () => void;
  /** Appli de cartes choisie la première fois (pour l'afficher en bas de l'écran). */
  onMapsApp: (app: MapsApp) => void;
};

// Au-delà de cette distance, la carte part ; sinon elle revient.
const THRESHOLD = 90;
const FLY_MS = 240;
// Quand il reste si peu de cartes, on charge la suite.
const PREFETCH = 3;

// Tant qu'on n'a jamais glissé une carte (retenu par l'iPhone) : sans geste pendant HINT_AFTER_MS, la carte
// du dessus esquisse un aller-retour, NAN puis MIAM, et recommence toutes les HINT_EVERY_MS.
const LEARNED_KEY = "swipeLearned";
const HINT_AFTER_MS = 3500;
const HINT_EVERY_MS = 7000;
const HINT_SHIFT = 70;
let learned = Platform.OS !== "ios" || Settings.get(LEARNED_KEY) === true;
function markLearned() {
  if (learned) return;
  learned = true;
  if (Platform.OS === "ios") Settings.set({ [LEARNED_KEY]: true });
}

/**
 * Le paquet de cartes, façon Tinder (comme src/components/SwipeDeck.tsx du site) : à gauche, « nan »,
 * la suivante (toujours plus loin, sans fin tant qu'il y a des restos ouverts) ; à droite, « miam », sa fiche
 * dans Plans ou Google Maps.
 * Les boutons ✕ et ♥ font la même chose, pour qui ne glisse pas.
 */
export function SwipeDeck({ places, home, current, onChange, onMapsApp, hasMore, loadingMore, onNeedMore }: Props) {
  useEffect(() => {
    if (hasMore && !loadingMore && current >= places.length - PREFETCH) onNeedMore();
  }, [current, places.length, hasMore, loadingMore, onNeedMore]);

  // Après la dernière carte : la suite charge, ou c'est vraiment tout.
  if (current >= places.length) {
    return (
      <View style={styles.end}>
        <Text style={styles.endText}>{t(hasMore || loadingMore ? "loadingMore" : "allSeen")}</Text>
        {!hasMore && !loadingMore && (
          <Pressable style={({ pressed }) => [styles.endButton, pressed && styles.pressed]} onPress={() => onChange(0)} accessibilityRole="button">
            <Text style={styles.endButtonText}>{t("backToFirst")}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  return <Deck place={places[current]} next={places[current + 1]} home={home} onNext={() => onChange(current + 1)} onMapsApp={onMapsApp} />;
}

type DeckProps = {
  place: Restaurant;
  /** La carte d'en dessous, s'il y en a une. */
  next: Restaurant | undefined;
  home: LatLng;
  onNext: () => void;
  onMapsApp: (app: MapsApp) => void;
};

function Deck({ place, next, home, onNext, onMapsApp }: DeckProps) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);

  // Nouvelle carte du dessus : elle part du centre.
  useEffect(() => {
    x.set(0);
  }, [place.id, x]);

  // Le petit aller-retour, si on ne touche à rien ; un doigt posé sur la carte l'arrête (pour cette carte).
  const touched = useSharedValue(false);
  useEffect(() => {
    if (learned) return;
    touched.set(false);
    const ease = { duration: 380, easing: Easing.inOut(Easing.quad) };
    let timer: ReturnType<typeof setTimeout>;
    const wiggle = () => {
      if (touched.get() || learned) return;
      x.set(withSequence(withTiming(-HINT_SHIFT, ease), withTiming(HINT_SHIFT, { ...ease, duration: 620 }), withTiming(0, ease)));
      timer = setTimeout(wiggle, HINT_EVERY_MS);
    };
    timer = setTimeout(wiggle, HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [place.id, x, touched]);

  const go = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    openPlace(place).then((app) => app && onMapsApp(app));
  };

  function fly(direction: "left" | "right") {
    touched.set(true);
    markLearned();
    Haptics.selectionAsync();
    if (direction === "right") {
      go();
      // La première fois, la feuille « Ouvrir avec… » s'affiche : la carte reste en place.
      if (!getMapsApp()) {
        x.set(withSpring(0));
        return;
      }
    }
    x.set(
      withTiming(direction === "left" ? -width * 1.3 : width * 1.3, { duration: FLY_MS }, (done) => {
        if (!done) return;
        if (direction === "left") scheduleOnRN(onNext);
        else x.set(withSpring(0));
      }),
    );
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onBegin(() => {
      touched.set(true);
    })
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
        {next && (
          <Animated.View style={[styles.behind, behind]} pointerEvents="none">
            <PlaceCard r={next} distance={distanceMeters(home, next.location)} />
          </Animated.View>
        )}
        <GestureDetector gesture={pan}>
          <Animated.View style={top}>
            {/* Un simple tap sur la carte : sa fiche, comme ♥. */}
            <Pressable onPress={() => fly("right")} accessibilityRole="link" accessibilityLabel={t("seeInMaps", { name: place.name })}>
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
        <Pressable
          style={({ pressed }) => [styles.round, styles.heart, pressed && styles.pressed]}
          onPress={() => fly("right")}
          accessibilityLabel={t("seeInMaps", { name: place.name })}
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
  end: { alignItems: "center", justifyContent: "center", gap: 14, minHeight: 160 },
  endText: { fontFamily: fonts.title, fontSize: 19, color: colors.ink, textAlign: "center" },
  endButton: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 11 },
  endButtonText: { fontFamily: fonts.title, fontSize: 16, color: "#fff" },
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
  actions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 64, marginTop: 14 },
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
  heart: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { transform: [{ scale: 0.92 }] },
  cross: { fontSize: 24, color: colors.muted },
  heartText: { fontSize: 30, color: "#fff" },
});
