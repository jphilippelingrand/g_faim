import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

/** Les anciens modes de recherche : la dame les sait encore (bandeau « au pif », course « vite vite »). */
export type Mode = "top" | "fast" | "surprise";

/** starving = ça gargouille non-stop (recherche) ; hungry = gros gargouillis réguliers ; happy = elle a trouvé, elle bave. */
export type Mood = "starving" | "hungry" | "happy";

const DURATION: Record<Mood, number> = { starving: 900, hungry: 2600, happy: 3400 };
const GRR = "GRROOOUUBBLL";
// Mode surprise : elle mange « au pif », les yeux bandés.
const PIF_LOOP = 1400;
// Mode rapide : un pas gauche + un pas droit.
const RUN_LOOP = 420;

// Où flottent les « ? » autour de la tête en mode surprise.
const QUESTION_POS = [{ left: "22%", fontSize: 22 }, { left: "70%", fontSize: 17 }, { left: "60%", fontSize: 25 }] as const;

// Taille par défaut ; la dame se dessine à n'importe quelle largeur (prop width), tout est proportionnel.
const W = 200;
const H = 225;
const VIEWBOX = "0 0 240 270";

/**
 * Même dessin que la version web, découpé en calques superposés (corps, ondes, ventre, bras)
 * pour animer le ventre et les ondes indépendamment. Tous les calques partagent le même viewBox.
 */
export function Lady({
  mood,
  mode = "top",
  width = W,
  onPress,
  accessibilityLabel,
}: {
  mood: Mood;
  mode?: Mode;
  width?: number;
  /** Action au toucher, en plus du sursaut (ex. ouvrir un menu). */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const surprise = mode === "surprise";
  const fast = mode === "fast";
  const k = width / W;
  const ladyW = width;
  const ladyH = H * k;
  // Un tap la fait gargouiller à fond pendant un instant.
  const [poked, setPoked] = useState(false);
  useEffect(() => {
    if (!poked) return;
    const t = setTimeout(() => setPoked(false), 1800);
    return () => clearTimeout(t);
  }, [poked]);

  const effective: Mood = poked ? "starving" : mood;

  // Une seule horloge 0 → 1 par cycle ; toutes les animations en sont des interpolations.
  const [clock] = useState(() => new Animated.Value(0));
  useEffect(() => {
    clock.setValue(0);
    const loop = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: DURATION[effective],
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [effective, clock]);

  // Mode surprise : une horloge à part pour la vague de « AU PIF ! » et les « ? » qui flottent.
  const [w] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!surprise) return;
    w.setValue(0);
    const loop = Animated.loop(Animated.timing(w, { toValue: 1, duration: PIF_LOOP, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [surprise, w]);

  // Mode rapide : elle court vers nous (pas alternés, bras qui balancent, poussière).
  const [stride] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!fast) return;
    stride.setValue(0);
    const loop = Animated.loop(Animated.timing(stride, { toValue: 1, duration: RUN_LOOP, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [fast, stride]);

  // Une pirouette (et une vibration) à chaque changement de mode, pas à l'affichage.
  const [spin] = useState(() => new Animated.Value(0));
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.bezier(0.5, 0, 0.3, 1.3), useNativeDriver: true }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [mode, spin]);

  const run = useMemo(() => {
    const at = <T extends number | string>(input: number[], output: T[]) =>
      stride.interpolate<T>({ inputRange: input, outputRange: output, extrapolate: "clamp" });
    // Un pied se lève pendant que l'autre touche le sol ; la poussière part du pied qui vient de pousser.
    const foot = (o: number) => at([0, 0.25, 0.5, 0.75, 1], o ? [0, 0, 0, -8, 0] : [0, -8, 0, 0, 0]);
    const dust = (o: number) => ({
      opacity: at(o ? [0.5, 0.55, 0.95] : [0, 0.05, 0.45], [0, 0.7, 0]),
      scale: at(o ? [0.5, 0.95] : [0, 0.45], [0.4, 1.6]),
    });
    return {
      bounce: at([0, 0.25, 0.5, 0.75, 1], [0, -4, 0, -4, 0]),
      leftFoot: foot(0),
      rightFoot: foot(1),
      leftArm: at([0, 0.5, 1], ["14deg", "-14deg", "14deg"]),
      rightArm: at([0, 0.5, 1], ["14deg", "-14deg", "14deg"]),
      leftDust: dust(0),
      rightDust: dust(1),
    };
  }, [stride]);

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
      clock.interpolate<T>({ inputRange: input, outputRange: output, extrapolate: "clamp" });
    return {
      shakeX: at([0, 0.04, 0.08, 0.12, 0.16, 0.22, 0.28, 0.4, 1], [0, -2, 2, -2, 2, -1, 1, 0, 0]),
      shakeRot: at([0, 0.04, 0.08, 0.12, 0.16, 0.4, 1], ["0deg", "-1deg", "1deg", "-0.6deg", "0.6deg", "0deg", "0deg"]),
      bellyX: at([0, 0.05, 0.1, 0.15, 0.2, 0.26, 0.32, 0.37, 0.42, 1], [1, 1.16, 0.9, 1.12, 0.94, 1.07, 0.98, 1.02, 1, 1]),
      bellyY: at([0, 0.05, 0.1, 0.15, 0.2, 0.26, 0.32, 0.37, 0.42, 1], [1, 0.86, 1.12, 0.9, 1.06, 0.95, 1.02, 0.99, 1, 1]),
      bellyLift: at([0, 0.1, 0.2, 0.3, 1], [0, -3, -2, 0, 0]),
      waveOpacity: at([0, 0.06, 0.3, 0.45, 1], [0, 1, 0.8, 0, 0]),
      waveScale: at([0, 0.06, 0.3, 0.45, 1], [0.7, 1, 1.12, 0.7, 0.7]),
      mouth: at([0, 0.08, 0.28, 0.4, 1], [1, 1.6, 1.6, 1, 1]),
      letter: (i: number, step = 35) => {
        const d = (i * step) / DURATION[effective];
        return {
          opacity: at([d, d + 0.06, d + 0.38, d + 0.48], [0, 1, 1, 0]),
          translateY: at([d, d + 0.06, d + 0.12, d + 0.18, d + 0.24], [8, -8, 3, -3, 0]),
          scale: at([d, d + 0.06, d + 0.12, d + 0.24], [0.5, 1.25, 0.95, 1]),
        };
      },
    };
  }, [clock, effective]);

  function poke() {
    setPoked(true);
    Haptics.impactAsync(onPress ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
    onPress?.();
  }

  const happy = effective === "happy";

  return (
    <Pressable onPress={poke} accessibilityLabel={accessibilityLabel ?? t("ladyLabel")} style={[styles.wrap, { paddingTop: 34 * k }]}>
      <View style={styles.grr} pointerEvents="none">
        {surprise ? (
          <Animated.Text style={[styles.letter, styles.pif, { fontSize: 26 * k }, { transform: [{ translateY: pif.bob }, { rotate: pif.tilt }] }]}>
            {t("ladyPif")}
          </Animated.Text>
        ) : (
          [...(fast ? t("ladyFast") : GRR)].map((ch, i) => {
            const l = anim.letter(i, fast ? 40 : 35);
            return (
              <Animated.Text
                key={i}
                style={[styles.letter, { fontSize: 26 * k, opacity: l.opacity, transform: [{ translateY: l.translateY }, { scale: l.scale }] }]}
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
            style={[styles.question, { top: 50 * k, left: QUESTION_POS[i].left, fontSize: QUESTION_POS[i].fontSize * k, opacity: q.opacity, transform: [{ translateY: q.translateY }] }]}
          >
            ?
          </Animated.Text>
        ))}

      <Animated.View style={{ transform: [{ perspective: 600 }, { rotateY: pif.spin }] }}>
        <Animated.View style={[styles.figure, { width: ladyW, height: ladyH, transform: [{ translateX: anim.shakeX }, { translateY: fast ? run.bounce : 0 }, { rotate: anim.shakeRot }] }]}>
          {/* poussière (mode rapide) puis pieds, chacun son calque pour les pas */}
          {fast &&
            ([[80, run.leftDust], [160, run.rightDust]] as const).map(([cx, d]) => (
              <Animated.View key={cx} style={[StyleSheet.absoluteFill, { transformOrigin: `${(cx / 240) * 100}% 95%`, opacity: d.opacity, transform: [{ scale: d.scale }] }]}>
                <Svg width={ladyW} height={ladyH} viewBox={VIEWBOX}>
                  <Circle cx={cx} cy="256" r="7" fill={colors.muted} />
                </Svg>
              </Animated.View>
            ))}
          {([[100, run.leftFoot], [140, run.rightFoot]] as const).map(([cx, lift]) => (
            <Animated.View key={cx} style={[StyleSheet.absoluteFill, fast && { transform: [{ translateY: lift }] }]}>
              <Svg width={ladyW} height={ladyH} viewBox={VIEWBOX}>
                <Ellipse cx={cx} cy="258" rx="16" ry="7" fill={colors.ink} />
              </Svg>
            </Animated.View>
          ))}

          {/* corps, tête, visage */}
          <Svg width={ladyW} height={ladyH} viewBox={VIEWBOX} style={StyleSheet.absoluteFill}>
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
              <Svg width={ladyW} height={ladyH} viewBox={VIEWBOX}>
                <Ellipse cx="120" cy="71" rx="4" ry="5" fill={colors.ink} />
              </Svg>
            </Animated.View>
          )}

          {/* ((( ))) */}
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.bellyOrigin, { opacity: anim.waveOpacity, transform: [{ scale: anim.waveScale }] }]}
          >
            <Svg width={ladyW} height={ladyH} viewBox={VIEWBOX}>
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
            <Svg width={ladyW} height={ladyH} viewBox={VIEWBOX}>
              <Ellipse cx="120" cy="168" rx="60" ry="52" fill={colors.dressDark} />
              <Ellipse cx="104" cy="150" rx="22" ry="12" fill="#fff" opacity={0.12} />
              <Path d="M76 178 q11 -10 22 0 t22 0 t22 0 t22 0" fill="none" stroke={colors.ink} strokeOpacity={0.25} strokeWidth="3" strokeLinecap="round" />
              <Circle cx="120" cy="172" r="3.5" fill={colors.ink} opacity={0.55} />
            </Svg>
          </Animated.View>

          {/* bras, mains posées sur le ventre ; en mode rapide, ils balancent depuis l'épaule */}
          {(
            [
              ["M94 92 Q66 120 78 150", 80, styles.leftShoulder, run.leftArm],
              ["M146 92 Q174 120 162 150", 160, styles.rightShoulder, run.rightArm],
            ] as const
          ).map(([d, cx, shoulder, swing]) => (
            <Animated.View key={cx} style={[StyleSheet.absoluteFill, shoulder, fast && { transform: [{ rotate: swing }] }]}>
              <Svg width={ladyW} height={ladyH} viewBox={VIEWBOX}>
                <Path d={d} fill="none" stroke={colors.skin} strokeWidth="10" strokeLinecap="round" />
                <Circle cx={cx} cy="152" r="8" fill={colors.skin} />
              </Svg>
            </Animated.View>
          ))}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 34 },
  figure: { transformOrigin: "50% 95%" },
  // Centres de déformation, en % du viewBox 240×270 : ventre (120, 200), bouche (120, 71).
  bellyOrigin: { transformOrigin: "50% 74%" },
  mouthOrigin: { transformOrigin: "50% 26%" },
  // Épaules (94, 92) et (146, 92) dans le viewBox 240×270.
  leftShoulder: { transformOrigin: "39% 34%" },
  rightShoulder: { transformOrigin: "61% 34%" },
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
