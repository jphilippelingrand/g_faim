import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";
import { colors, fonts } from "../theme";

/** starving = ça gargouille non-stop (recherche) ; hungry = gros gargouillis réguliers ; happy = elle a trouvé, elle bave. */
export type Mood = "starving" | "hungry" | "happy";

const DURATION: Record<Mood, number> = { starving: 900, hungry: 2600, happy: 3400 };
const GRR = "GRROOOUUBBLL";
// Mode surprise : elle mange « au pif », les yeux bandés.
const PIF = "AU PIF !";
const PIF_LOOP = 1400;

// Où flottent les « ? » autour de la tête en mode surprise.
const QUESTION_POS = [{ left: "22%", fontSize: 22 }, { left: "70%", fontSize: 17 }, { left: "60%", fontSize: 25 }] as const;

const W = 200;
const H = 225;
const VIEWBOX = "0 0 240 270";

/**
 * Même dessin que la version web, découpé en calques superposés (corps, ondes, ventre, bras)
 * pour animer le ventre et les ondes indépendamment. Tous les calques partagent le même viewBox.
 */
export function Lady({ mood, surprise = false }: { mood: Mood; surprise?: boolean }) {
  // Un tap la fait gargouiller à fond pendant un instant.
  const [poked, setPoked] = useState(false);
  useEffect(() => {
    if (!poked) return;
    const t = setTimeout(() => setPoked(false), 1800);
    return () => clearTimeout(t);
  }, [poked]);

  const effective: Mood = poked ? "starving" : mood;

  // Une seule horloge 0 → 1 par cycle ; toutes les animations en sont des interpolations.
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    t.setValue(0);
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: DURATION[effective],
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [effective, t]);

  // Mode surprise : une horloge à part pour la vague de « AU PIF ! » et les « ? » qui flottent.
  const [w] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!surprise) return;
    w.setValue(0);
    const loop = Animated.loop(Animated.timing(w, { toValue: 1, duration: PIF_LOOP, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [surprise, w]);

  // Une pirouette (et une vibration) quand on active le mode surprise.
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!surprise) return;
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.bezier(0.5, 0, 0.3, 1.3), useNativeDriver: true }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [surprise, spin]);

  const pif = useMemo(() => {
    const at = <T extends number | string>(v: Animated.Value, input: number[], output: T[]) =>
      v.interpolate<T>({ inputRange: input, outputRange: output, extrapolate: "clamp" });
    const question = (start: number) => ({
      opacity: at(w, [start, start + 0.12, start + 0.5], [0, 1, 0]),
      translateY: at(w, [start, start + 0.5], [24, -16]),
    });
    return {
      bob: at(w, [0, 0.3, 0.6, 1], [0, -6, 1, 0]),
      tilt: at(w, [0, 0.3, 0.6, 1], ["0deg", "-4deg", "3deg", "0deg"]),
      questions: [question(0), question(0.3), question(0.5)],
      spin: at(spin, [0, 1], ["0deg", "360deg"]),
    };
  }, [w, spin]);

  const anim = useMemo(() => {
    const at = <T extends number | string>(input: number[], output: T[]) =>
      t.interpolate<T>({ inputRange: input, outputRange: output, extrapolate: "clamp" });
    return {
      shakeX: at([0, 0.04, 0.08, 0.12, 0.16, 0.22, 0.28, 0.4, 1], [0, -2, 2, -2, 2, -1, 1, 0, 0]),
      shakeRot: at([0, 0.04, 0.08, 0.12, 0.16, 0.4, 1], ["0deg", "-1deg", "1deg", "-0.6deg", "0.6deg", "0deg", "0deg"]),
      bellyX: at([0, 0.05, 0.1, 0.15, 0.2, 0.26, 0.32, 0.37, 0.42, 1], [1, 1.16, 0.9, 1.12, 0.94, 1.07, 0.98, 1.02, 1, 1]),
      bellyY: at([0, 0.05, 0.1, 0.15, 0.2, 0.26, 0.32, 0.37, 0.42, 1], [1, 0.86, 1.12, 0.9, 1.06, 0.95, 1.02, 0.99, 1, 1]),
      bellyLift: at([0, 0.1, 0.2, 0.3, 1], [0, -3, -2, 0, 0]),
      waveOpacity: at([0, 0.06, 0.3, 0.45, 1], [0, 1, 0.8, 0, 0]),
      waveScale: at([0, 0.06, 0.3, 0.45, 1], [0.7, 1, 1.12, 0.7, 0.7]),
      mouth: at([0, 0.08, 0.28, 0.4, 1], [1, 1.6, 1.6, 1, 1]),
      letter: (i: number) => {
        const d = (i * 35) / DURATION[effective];
        return {
          opacity: at([d, d + 0.06, d + 0.38, d + 0.48], [0, 1, 1, 0]),
          translateY: at([d, d + 0.06, d + 0.12, d + 0.18, d + 0.24], [8, -8, 3, -3, 0]),
          scale: at([d, d + 0.06, d + 0.12, d + 0.24], [0.5, 1.25, 0.95, 1]),
        };
      },
    };
  }, [t, effective]);

  function poke() {
    setPoked(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }

  const happy = effective === "happy";

  return (
    <Pressable onPress={poke} accessibilityLabel="La petite dame a faim" style={styles.wrap}>
      <View style={styles.grr} pointerEvents="none">
        {surprise ? (
          <Animated.Text style={[styles.letter, styles.pif, { transform: [{ translateY: pif.bob }, { rotate: pif.tilt }] }]}>
            {PIF}
          </Animated.Text>
        ) : (
          [...GRR].map((ch, i) => {
            const l = anim.letter(i);
            return (
              <Animated.Text
                key={i}
                style={[styles.letter, { opacity: l.opacity, transform: [{ translateY: l.translateY }, { scale: l.scale }] }]}
              >
                {ch}
              </Animated.Text>
            );
          })
        )}
      </View>

      {surprise &&
        pif.questions.map((q, i) => (
          <Animated.Text
            key={i}
            pointerEvents="none"
            style={[styles.question, QUESTION_POS[i], { opacity: q.opacity, transform: [{ translateY: q.translateY }] }]}
          >
            ?
          </Animated.Text>
        ))}

      <Animated.View style={{ transform: [{ perspective: 600 }, { rotateY: pif.spin }] }}>
        <Animated.View style={[styles.figure, { transform: [{ translateX: anim.shakeX }, { rotate: anim.shakeRot }] }]}>
          {/* corps, tête, visage */}
          <Svg width={W} height={H} viewBox={VIEWBOX} style={StyleSheet.absoluteFill}>
            <Ellipse cx="100" cy="258" rx="16" ry="7" fill={colors.ink} />
            <Ellipse cx="140" cy="258" rx="16" ry="7" fill={colors.ink} />
            <Path d="M92 84 Q120 76 148 84 L172 252 L68 252 Z" fill={colors.dress} />
            <Circle cx="120" cy="22" r="14" fill={colors.hair} />
            <Circle cx="120" cy="54" r="28" fill={colors.skin} />
            <Path d="M92 50 Q96 24 120 24 Q144 24 148 50 Q136 36 120 38 Q104 36 92 50 Z" fill={colors.hair} />
            <Circle cx="100" cy="66" r="5" fill={colors.blush} />
            <Circle cx="140" cy="66" r="5" fill={colors.blush} />
            {surprise ? (
              <G>
                {/* bandeau à pois noué sur le côté */}
                <Path d="M147 52 q9 -9 17 -4 q-7 6 -15 8 Z" fill="#e0a024" />
                <Path d="M147 58 q10 6 14 15 q-9 -3 -15 -11 Z" fill="#e0a024" />
                <Path d="M91 49 Q120 43 149 49 L149 61 Q120 55 91 61 Z" fill="#f2b134" />
                <G fill="#fff">
                  <Circle cx="100" cy="54.5" r="1.8" />
                  <Circle cx="112" cy="51.5" r="1.8" />
                  <Circle cx="127" cy="51.5" r="1.8" />
                  <Circle cx="140" cy="54.5" r="1.8" />
                </G>
                {/* grand sourire gourmand */}
                <Path d="M108 66 q12 15 24 0 Z" fill={colors.ink} />
                <Path d="M114 71.5 q6 4 12 0 q-6 3.5 -12 0 Z" fill={colors.blush} />
              </G>
            ) : happy ? (
              <G fill="none" stroke={colors.ink} strokeWidth="2.5" strokeLinecap="round">
                <Path d="M102 56 q6 -7 12 0" />
                <Path d="M126 56 q6 -7 12 0" />
                <Path d="M110 68 q10 10 20 0" />
                <Path d="M127 72 q1 6 0 11" stroke="#8ec5e8" strokeWidth="3.5" />
              </G>
            ) : (
              <G>
                <G fill="none" stroke={colors.ink} strokeWidth="2.5" strokeLinecap="round">
                  <Path d="M100 46 l11 -4" />
                  <Path d="M140 46 l-11 -4" />
                </G>
                <Circle cx="108" cy="55" r="3" fill={colors.ink} />
                <Circle cx="132" cy="55" r="3" fill={colors.ink} />
              </G>
            )}
          </Svg>

          {!happy && !surprise && (
            <Animated.View style={[StyleSheet.absoluteFill, styles.mouthOrigin, { transform: [{ scaleY: anim.mouth }] }]}>
              <Svg width={W} height={H} viewBox={VIEWBOX}>
                <Ellipse cx="120" cy="71" rx="4" ry="5" fill={colors.ink} />
              </Svg>
            </Animated.View>
          )}

          {/* ((( ))) */}
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.bellyOrigin, { opacity: anim.waveOpacity, transform: [{ scale: anim.waveScale }] }]}
          >
            <Svg width={W} height={H} viewBox={VIEWBOX}>
              <G fill="none" stroke={colors.accent} strokeWidth="4" strokeLinecap="round">
                <Path d="M52 150 q-9 18 0 36" />
                <Path d="M38 142 q-13 26 0 52" />
                <Path d="M24 134 q-17 34 0 68" />
                <Path d="M188 150 q9 18 0 36" />
                <Path d="M202 142 q13 26 0 52" />
                <Path d="M216 134 q17 34 0 68" />
              </G>
            </Svg>
          </Animated.View>

          {/* le ventre */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.bellyOrigin,
              { transform: [{ translateY: anim.bellyLift }, { scaleX: anim.bellyX }, { scaleY: anim.bellyY }] },
            ]}
          >
            <Svg width={W} height={H} viewBox={VIEWBOX}>
              <Ellipse cx="120" cy="168" rx="60" ry="52" fill={colors.dressDark} />
              <Ellipse cx="104" cy="150" rx="22" ry="12" fill="#fff" opacity={0.12} />
              <Path d="M76 178 q11 -10 22 0 t22 0 t22 0 t22 0" fill="none" stroke={colors.ink} strokeOpacity={0.25} strokeWidth="3" strokeLinecap="round" />
              <Circle cx="120" cy="172" r="3.5" fill={colors.ink} opacity={0.55} />
            </Svg>
          </Animated.View>

          {/* bras, mains posées sur le ventre */}
          <Svg width={W} height={H} viewBox={VIEWBOX} style={StyleSheet.absoluteFill}>
            <Path d="M94 92 Q66 120 78 150" fill="none" stroke={colors.skin} strokeWidth="10" strokeLinecap="round" />
            <Path d="M146 92 Q174 120 162 150" fill="none" stroke={colors.skin} strokeWidth="10" strokeLinecap="round" />
            <Circle cx="80" cy="152" r="8" fill={colors.skin} />
            <Circle cx="160" cy="152" r="8" fill={colors.skin} />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 34 },
  figure: { width: W, height: H, transformOrigin: "50% 95%" },
  // Centres de déformation, en % du viewBox 240×270 : ventre (120, 200), bouche (120, 71).
  bellyOrigin: { transformOrigin: "50% 74%" },
  mouthOrigin: { transformOrigin: "50% 26%" },
  grr: {
    position: "absolute",
    top: 0,
    flexDirection: "row",
    transform: [{ rotate: "-6deg" }],
  },
  pif: { color: "#e0a024" },
  question: {
    position: "absolute",
    top: 50,
    fontFamily: fonts.grr,
    color: "#e0a024",
  },
  letter: {
    fontFamily: fonts.grr,
    fontSize: 26,
    color: colors.accent,
    textShadowColor: colors.ink,
    textShadowRadius: 1,
  },
});
