import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from "react-native-reanimated";
import { colors, fonts } from "../theme";

/**
 * Les marqueurs de la carte, tous de la même famille : des bulles en dégradé corail (taupe pour les fermés),
 * cerclées de blanc, dans une lueur douce, avec un petit reflet qui les bombe.
 * - un resto seul (« idle ») : l'anneau, fond transparent ;
 * - un resto coché dans un vote (« picked ») : une petite bulle pleine avec une coche ;
 * - celui qu'on regarde (« selected ») : une grosse bulle, qui apparaît d'un petit rebond puis respire (un halo
 *   qui s'élargit et s'efface) ;
 * - un groupe (ClusterDot) : une bulle avec le nombre de restos.
 * `neutral` : tout en taupe, ouvert ou non (la carte d'un vote, où seuls les cochés sont en couleur).
 */
export function MapDot({ state, open, neutral }: { state: "idle" | "picked" | "selected"; open?: boolean; neutral?: boolean }) {
  if (state === "picked") return <PickedDot />;
  if (state === "idle") return <Ring tone={neutral ? "neutral" : open ? "open" : "closed"} />;
  return <SelectedDot tone={neutral ? COLD : HOT} />;
}

// Corail (ouvert) ou taupe (fermé).
const HOT = { light: "#ff8a5c", dark: colors.accent };
const COLD = { light: "#b3a59a", dark: colors.muted };
type Tone = typeof HOT;

/** La lueur et le dégradé d'une bulle (à mettre dans <Defs>). */
function Gradients({ tone }: { tone: Tone }) {
  return (
    <>
      <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
        <Stop offset="0.45" stopColor={tone.dark} stopOpacity={0.35} />
        <Stop offset="1" stopColor={tone.dark} stopOpacity={0} />
      </RadialGradient>
      <LinearGradient id="fill" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={tone.light} />
        <Stop offset="1" stopColor={tone.dark} />
      </LinearGradient>
    </>
  );
}

/** Une bulle pleine de `size`, centrée dans un cadre de `frame` (la place de sa lueur). */
function Bubble({ size, frame, tone, children }: { size: number; frame: number; tone: Tone; children?: React.ReactNode }) {
  const c = frame / 2;
  return (
    <Svg width={frame} height={frame}>
      <Defs>
        <Gradients tone={tone} />
      </Defs>
      <Circle cx={c} cy={c} r={c} fill="url(#glow)" />
      <Circle cx={c} cy={c} r={size / 2} fill="url(#fill)" stroke="#fff" strokeWidth={Math.max(2.5, size / 11)} />
      <Circle cx={c - size * 0.16} cy={c - size * 0.18} r={size * 0.13} fill="#fff" fillOpacity={0.22} />
      {children}
    </Svg>
  );
}

// Un resto seul : l'anneau en dégradé, liseré de blanc pour se détacher de n'importe quel fond de carte.
const RING = 18;
const RING_FRAME = 30;

function Ring({ tone: kind }: { tone: "open" | "closed" | "neutral" }) {
  const c = RING_FRAME / 2;
  const tone = kind === "open" ? HOT : COLD;
  return (
    <Svg width={RING_FRAME} height={RING_FRAME} style={kind === "closed" && styles.closed}>
      <Defs>
        <Gradients tone={tone} />
      </Defs>
      {kind === "open" && <Circle cx={c} cy={c} r={c} fill="url(#glow)" />}
      <Circle cx={c} cy={c} r={RING / 2} fill="rgba(255,255,255,0.01)" stroke="#fff" strokeWidth={6} strokeOpacity={0.95} />
      <Circle cx={c} cy={c} r={RING / 2} fill="none" stroke="url(#fill)" strokeWidth={3.5} />
      {/* Le reflet, posé sur l'anneau en haut à gauche. */}
      <Circle cx={c - RING * 0.33} cy={c - RING * 0.33} r={1.6} fill="#fff" fillOpacity={0.8} />
    </Svg>
  );
}

// Coché dans un vote : une petite bulle avec une coche blanche.
const PICKED = 24;
const PICKED_FRAME = 40;

function PickedDot() {
  const c = PICKED_FRAME / 2;
  return (
    <Bubble size={PICKED} frame={PICKED_FRAME} tone={HOT}>
      <Path
        d={`M ${c - 4.5} ${c + 0.5} L ${c - 1.2} ${c + 3.8} L ${c + 5} ${c - 3.2}`}
        stroke="#fff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Bubble>
  );
}

/** 1 103 → « 1,1k » : le nombre tient dans la bulle. */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "").replace(".", ",") : Math.round(k)}k`;
}

/** Plusieurs restos trop proches à ce zoom : une bulle avec leur nombre, qui grossit (un peu) avec lui. */
export function ClusterDot({ count, open }: { count: number; open: boolean }) {
  const size = Math.round(34 + 6 * Math.log10(count));
  const frame = Math.round(size * 1.7);
  const label = compact(count);
  return (
    <View style={{ width: frame, height: frame, alignItems: "center", justifyContent: "center" }}>
      <View style={StyleSheet.absoluteFill}>
        <Bubble size={size} frame={frame} tone={open ? HOT : COLD} />
      </View>
      <Text style={[styles.count, { fontSize: label.length > 3 ? 13 : 15 }]}>{label}</Text>
    </View>
  );
}

// Le halo : une respiration toutes les 1,8 s.
const PULSE_MS = 1800;
const SELECTED = 32;
const SELECTED_FRAME = Math.round(SELECTED * 2.4);

function SelectedDot({ tone }: { tone: Tone }) {
  const pop = useSharedValue(0.6);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pop.value = withSpring(1, { damping: 7, stiffness: 260 });
    pulse.value = withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pop, pulse]);

  const halo = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - pulse.value), transform: [{ scale: 1 + 1.2 * pulse.value }] }));
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const c = SELECTED_FRAME / 2;

  return (
    <View style={styles.frame}>
      <Animated.View style={[styles.halo, { borderColor: tone.dark, backgroundColor: tone.dark + "26" }, halo]} />
      <Animated.View style={[StyleSheet.absoluteFill, dot]}>
        <Bubble size={SELECTED} frame={SELECTED_FRAME} tone={tone}>
          {/* Un cœur de cible blanc : c'est celui-là. */}
          <Circle cx={c} cy={c} r={4.5} fill="#fff" />
        </Bubble>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fermé : en retrait, pour que les ouverts sautent aux yeux.
  closed: { opacity: 0.75 },
  count: { fontFamily: fonts.grr, color: "#fff", letterSpacing: -0.3, marginTop: -1 },
  // De la place autour pour le halo (le marqueur est centré sur le resto).
  frame: { width: SELECTED_FRAME, height: SELECTED_FRAME, alignItems: "center", justifyContent: "center" },
  // Le halo qui respire : un anneau corail, pas un disque plein.
  halo: { position: "absolute", width: SELECTED, height: SELECTED, borderRadius: SELECTED / 2, borderWidth: 3 },
});
