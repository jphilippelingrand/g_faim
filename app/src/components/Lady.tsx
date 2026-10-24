import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";
import { colors, fonts } from "../theme";

/** starving = ça gargouille non-stop (recherche) ; hungry = gros gargouillis réguliers ; happy = elle a trouvé, elle bave. */
export type Mood = "starving" | "hungry" | "happy";

const DURATION: Record<Mood, number> = { starving: 900, hungry: 2600, happy: 3400 };
const GRR = "GRROOOUUBBLL";

const W = 200;
const H = 225;
const VIEWBOX = "0 0 240 270";

/**
 * Même dessin que la version web, découpé en calques superposés (corps, ondes, ventre, bras)
 * pour animer le ventre et les ondes indépendamment. Tous les calques partagent le même viewBox.
 */
export function Lady({ mood }: { mood: Mood }) {
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
        {[...GRR].map((ch, i) => {
          const l = anim.letter(i);
          return (
            <Animated.Text
              key={i}
              style={[styles.letter, { opacity: l.opacity, transform: [{ translateY: l.translateY }, { scale: l.scale }] }]}
            >
              {ch}
            </Animated.Text>
          );
        })}
      </View>

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
          {happy ? (
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

        {!happy && (
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
  letter: {
    fontFamily: fonts.grr,
    fontSize: 26,
    color: colors.accent,
    textShadowColor: colors.ink,
    textShadowRadius: 1,
  },
});
