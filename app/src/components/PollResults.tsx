import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
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
 * Un sondage dans l'app (rafraîchi tout seul), condensé comme un sondage Facebook : la carte de ses restos
 * seulement, puis le classement des restos (rang, nombre de ❤️). Toucher une ligne met (ou retire) son ❤️
 * et la montre sur la carte ; « Envoyer mon vote » enregistre. Le bouton ↗ ouvre sa fiche dans les cartes.
 * Ensuite : partager le résultat, renvoyer le lien, supprimer le vote (si on l'a lancé) ou l'oublier.
 * Vote fini : plus de vote possible, l'élu en grand (ou l'égalité), tant que le serveur garde le résultat.
 */
export function PollResults({ poll, home, onMapsApp, onBack, onGone }: Props) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Son vote en cours d'édition (null : on montre celui enregistré, ou on n'a pas encore voté).
  const [draft, setDraft] = useState<boolean[] | null>(null);
  const [sending, setSending] = useState(false);
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

  async function sendVote() {
    if (!live || !draft) return;
    setSending(true);
    try {
      setResults(await votePoll(poll, draft));
      setDraft(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  const shareResult = () =>
    live && Share.share({ message: resultShareText(live, poll.url, { won: t("pollWon"), open: t("pollShareText") }) });
  // Juste le lien, sans texte autour (sur iOS, `url` : l'aperçu du lien s'affiche dans Messages).
  const shareLink = () => Share.share(Platform.OS === "ios" ? { url: poll.url } : { message: poll.url });

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

  // L'ordre du classement (à égalité, l'ordre proposé) : il ne bouge pas pendant qu'on coche, seulement
  // quand le résultat du serveur change.
  const order = live ? live.places.map((_, i) => i).sort((a, b) => live.hearts[b] - live.hearts[a] || a - b) : [];
  // Les restos du vote, sous la forme qu'attendent la carte et l'ouverture dans Plans / Google Maps.
  const restos = live ? live.places.map(asRestaurant) : [];
  const top = live ? winner(live) : null;
  const votes = live ? (live.voters === 0 ? t("pollNoVotes") : live.voters === 1 ? t("pollOneVote") : t("pollVotes", { n: live.voters })) : "";
  // Ce qu'on affiche pour son vote : le brouillon, sinon le vote enregistré.
  const mine = draft ?? live?.mine ?? null;

  return (
    <View style={styles.screen}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ {t("pollBack")}</Text>
      </Pressable>

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
            const hearts = live.hearts[i];
            // Ex aequo : même rang. Pas de rang tant que personne n'a voté.
            const rank = 1 + live.hearts.filter((h) => h > hearts).length;
            const like = mine?.[i] === true;
            const cuisine = place.cuisine ? cuisineLabel(place.cuisine) : null;
            const tap = () => {
              Haptics.selectionAsync();
              setFocused(r.id);
              if (live.closed) return;
              setDraft((d) => {
                const next = d ?? live.mine ?? live.places.map(() => false);
                return next.map((v, j) => (j === i ? !v : v));
              });
            };
            return (
              <View key={r.id} style={[styles.option, focused === r.id && styles.optionFocused]}>
                <Pressable
                  style={({ pressed }) => [styles.optionMain, pressed && styles.rowPressed]}
                  onPress={tap}
                  accessibilityRole={live.closed ? "button" : "checkbox"}
                  accessibilityState={live.closed ? undefined : { checked: like }}
                  accessibilityLabel={`${live.voters ? `${rank}. ` : ""}${place.name}, ❤️ ${hearts}`}
                >
                  <Text style={[styles.rank, rank === 1 && hearts > 0 && styles.rankFirst]}>{live.voters ? rank : "·"}</Text>
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
                    {like ? "❤️" : "♡"} {hearts}
                  </Text>
                </Pressable>
                <OpenInMaps place={r} onMapsApp={onMapsApp} />
              </View>
            );
          })}
          {draft && !live.closed && (
            <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={sendVote} disabled={sending} accessibilityRole="button">
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t(live.mine ? "pollChangeVote" : "pollSendVote")}</Text>}
            </Pressable>
          )}
          {!draft && !live.closed && !live.mine && <Text style={styles.hint}>{t("pollTapToVote")}</Text>}

          <Pressable style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} onPress={shareResult} accessibilityRole="button">
            <Text style={styles.secondaryText}>🏆 {t("pollShareResult")}</Text>
          </Pressable>
          <Pressable onPress={shareLink} accessibilityRole="link" accessibilityLabel={t("pollResend")} hitSlop={8}>
            <Text style={styles.link}>🔗 {poll.url.replace(/^https?:\/\//, "")}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.delete, pressed && styles.pressed]} onPress={remove} disabled={deleting} accessibilityRole="button">
            {deleting ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.deleteText}>{t(poll.owner ? "pollDelete" : "pollForget")}</Text>}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  back: { alignSelf: "flex-start", marginBottom: 6 },
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
  primary: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  primaryText: { fontFamily: fonts.title, fontSize: 16, color: "#fff" },
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
  link: { fontFamily: fonts.medium, fontSize: 15, color: colors.accent, textAlign: "center", textDecorationLine: "underline", paddingVertical: 6 },
  delete: { paddingVertical: 14, alignItems: "center" },
  deleteText: { fontFamily: fonts.medium, fontSize: 15, color: colors.accent },
  pressed: { transform: [{ scale: 0.97 }] },
});
