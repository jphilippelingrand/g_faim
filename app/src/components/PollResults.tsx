import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { cuisineLabel } from "../lib/osm";
import type { MapsApp } from "../lib/mapsApp";
import type { LatLng } from "../lib/places";
import {
  deletePoll,
  forgetPoll,
  pollResults,
  resultShareText,
  votePoll,
  winner,
  type MyPoll,
  type PollPlace,
  type PollResults as Results,
} from "../lib/polls";
import { IconButton } from "./IconButton";
import { OpenInMaps } from "./OpenInMaps";
import { PollMap } from "./PollMap";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

type Props = {
  poll: MyPoll;
  home: LatLng;
  /** L'appli de cartes choisie en ouvrant un resto (bouton ↗). */
  onMapsApp?: (app: MapsApp) => void;
  onBack: () => void;
  /** Supprimé, oublié ou trouvé expiré : la feuille l'enlève de « En cours ». */
  onGone: (poll: MyPoll) => void;
};

const REFRESH_MS = 10_000;

export function timeLeft(expiresAt: number): string {
  const minutes = Math.max(1, Math.round((expiresAt - Date.now()) / 60_000));
  if (minutes < 60) return t("pollLeftMin", { n: minutes });
  if (minutes < 48 * 60) return t("pollLeftHours", { n: Math.round(minutes / 60) });
  return t("pollLeftDays", { n: Math.round(minutes / 1440) });
}

/** Un resto du sondage, sous la forme qu'attend l'ouverture dans Plans / Google Maps. */
const asRestaurant = (p: PollPlace) => ({
  id: `${p.lat},${p.lng},${p.name}`,
  name: p.name,
  cuisine: p.cuisine,
  address: p.address,
  location: { latitude: p.lat, longitude: p.lng },
});

/**
 * Un sondage dans l'app (rafraîchi tout seul) : en haut, partager le résultat et la poubelle (supprimer le
 * vote si on l'a lancé, sinon l'oublier) ; la carte de ses restos seulement, puis le classement (rang,
 * nombre de ❤️). Toucher un resto met (ou retire) son ❤️ tout de suite : le classement se met à jour sans
 * attendre le serveur, puis avec sa réponse. Le bouton ↗ ouvre sa fiche dans les cartes.
 * Vote fini : plus de vote possible, l'élu en grand (ou l'égalité), tant que le serveur garde le résultat.
 */
export function PollResults({ poll, home, onMapsApp, onBack, onGone }: Props) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Son vote tel qu'on vient de le toucher, en attendant la réponse du serveur (null : celui enregistré).
  const [local, setLocal] = useState<boolean[] | null>(null);
  // Seule la réponse du dernier vote envoyé compte (on peut toucher plusieurs restos de suite).
  const voteId = useRef(0);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      pollResults(poll)
        .then((r) => {
          if (!alive) return;
          setResults(r);
          setError(false);
          if (r === "expired") forgetPoll(poll);
        })
        .catch(() => alive && setError(true));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [poll]);

  const live = results && results !== "expired" ? results : null;

  async function vote(likes: boolean[]) {
    const id = ++voteId.current;
    setLocal(likes);
    try {
      const after = await votePoll(poll, likes);
      if (id !== voteId.current) return;
      setResults(after);
      setLocal(null);
    } catch {
      if (id !== voteId.current) return;
      setLocal(null);
      setError(true);
    }
  }

  // Le résultat et son lien, en un seul partage.
  const share = () =>
    live && Share.share({ message: resultShareText(live, poll.url, { won: t("pollWon"), open: t("pollShareText") }) });

  const remove = () =>
    poll.owner
      ? Alert.alert(t("pollDeleteTitle"), t("pollDeleteBody"), [
          { text: t("cancel"), style: "cancel" },
          { text: t("pollDelete"), style: "destructive", onPress: confirmRemove },
        ])
      : confirmRemove();
  async function confirmRemove() {
    setDeleting(true);
    try {
      await deletePoll(poll);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onGone(poll);
    } catch {
      setError(true);
      setDeleting(false);
    }
  }

  // Son vote : celui qu'on vient de toucher, sinon l'enregistré ; et les ❤️ qui en tiennent compte tout de suite.
  const mine = local ?? live?.mine ?? null;
  const hearts = live ? live.hearts.map((h, i) => h + (local ? Number(local[i]) - Number(live.mine?.[i] ?? false) : 0)) : [];
  const voters = live ? live.voters + (local && !live.mine ? 1 : 0) : 0;
  // L'ordre du classement (à égalité, l'ordre proposé).
  const order = live ? live.places.map((_, i) => i).sort((a, b) => hearts[b] - hearts[a] || a - b) : [];
  // Les restos du vote, sous la forme qu'attendent la carte et l'ouverture dans Plans / Google Maps.
  const restos = live ? live.places.map(asRestaurant) : [];
  const top = live ? winner(live) : null;
  const votes = voters === 0 ? t("pollNoVotes") : voters === 1 ? t("pollOneVote") : t("pollVotes", { n: voters });

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" style={styles.back}>
          <Text style={styles.backText}>‹ {t("pollBack")}</Text>
        </Pressable>
        {live && (
          <IconButton label={t("pollShareResult")} onPress={share}>
            <Svg width={16} height={16} viewBox="0 0 16 16">
              <Path
                d="M8 10V2M5 4.8 8 1.8l3 3M4.5 7H3.5v7h9V7h-1"
                fill="none"
                stroke={colors.accent}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </IconButton>
        )}
        {results && (
          <IconButton label={t(poll.owner ? "pollDelete" : "pollForget")} onPress={remove} busy={deleting}>
            <Svg width={16} height={16} viewBox="0 0 16 16">
              <Path
                d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.7 6.5v4.5M9.3 6.5v4.5"
                fill="none"
                stroke={colors.accent}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </IconButton>
        )}
      </View>

      {!results && !error && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
      {error && <Text style={styles.error}>{t("oops")}</Text>}

      {results === "expired" && (
        <>
          <Text style={styles.sub}>{t("pollExpired")}</Text>
          <Pressable style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} onPress={() => onGone(poll)} accessibilityRole="button">
            <Text style={styles.secondaryText}>{t("pollBack")}</Text>
          </Pressable>
        </>
      )}

      {live && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sub}>
            {votes} · {live.closed ? t("pollClosed") : timeLeft(live.expiresAt)}
          </Text>

          {live.closed && (
            <View style={styles.final}>
              <Text style={styles.finalText}>{top ? `🏆 ${t("pollFinal", { name: top.name })}` : t("pollTie")}</Text>
            </View>
          )}

          <PollMap home={home} places={[]} picked={restos} focused={focused} onSelect={setFocused} height={160} />

          {/* Le classement : du plus aimé au moins aimé, son rang à gauche. À droite, comme un « j'aime » : le
              nombre de ❤️, et le cœur plein si on a mis le sien. */}
          {order.map((i) => {
            const place = live.places[i];
            const r = restos[i];
            const count = hearts[i];
            // Ex aequo : même rang. Pas de rang tant que personne n'a voté.
            const rank = 1 + hearts.filter((h) => h > count).length;
            const like = mine?.[i] === true;
            const cuisine = place.cuisine ? cuisineLabel(place.cuisine) : null;
            const tap = () => {
              Haptics.selectionAsync();
              setFocused(r.id);
              if (live.closed) return;
              const before = mine ?? live.places.map(() => false);
              vote(before.map((v, j) => (j === i ? !v : v)));
            };
            return (
              <View key={r.id} style={[styles.option, focused === r.id && styles.optionFocused]}>
                <Pressable
                  style={({ pressed }) => [styles.optionMain, pressed && styles.rowPressed]}
                  onPress={tap}
                  accessibilityRole={live.closed ? "button" : "checkbox"}
                  accessibilityState={live.closed ? undefined : { checked: like }}
                  accessibilityLabel={`${voters ? `${rank}. ` : ""}${place.name}, ❤️ ${count}`}
                >
                  <Text style={[styles.rank, rank === 1 && count > 0 && styles.rankFirst]}>{voters ? rank : "·"}</Text>
                  <View style={styles.optionText}>
                    <Text style={styles.name} numberOfLines={1}>
                      {place.name}
                    </Text>
                    {cuisine && (
                      <Text style={styles.info} numberOfLines={1}>
                        {cuisine.emoji} {cuisine.label}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.likes, like && styles.likesOn]}>
                    {like ? "❤️" : "♡"} {count}
                  </Text>
                </Pressable>
                <OpenInMaps place={r} onMapsApp={onMapsApp} />
              </View>
            );
          })}
          {!live.closed && !mine && <Text style={styles.hint}>{t("pollTapToVote")}</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // En haut, comme une barre d'outils iOS : retour à gauche, partager et poubelle à droite.
  bar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  back: { flex: 1 },
  backText: { fontFamily: fonts.medium, fontSize: 16, color: colors.accent },
  spinner: { marginTop: 40 },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.accent, textAlign: "center", marginVertical: 10 },
  content: { paddingBottom: 24, gap: 8 },
  sub: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginBottom: 4 },
  option: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, overflow: "hidden" },
  optionFocused: { borderColor: colors.accent },
  optionMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingLeft: 12 },
  optionText: { flex: 1 },
  rank: { width: 22, fontFamily: fonts.title, fontSize: 20, color: colors.muted, textAlign: "center" },
  rankFirst: { color: colors.accent },
  likes: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted },
  likesOn: { color: colors.accent },
  rowPressed: { opacity: 0.6 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center" },
  final: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center" },
  finalText: { fontFamily: fonts.grr, fontSize: 21, color: "#fff", textAlign: "center" },
  name: { flex: 1, fontFamily: fonts.title, fontSize: 18, color: colors.ink },
  info: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 3 },
  secondary: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: { fontFamily: fonts.title, fontSize: 16, color: colors.ink },
  pressed: { transform: [{ scale: 0.97 }] },
});
