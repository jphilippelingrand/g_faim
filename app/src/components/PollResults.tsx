import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { cuisineLabel } from "../lib/osm";
import { openPlace } from "../lib/mapsApp";
import {
  deletePoll,
  forgetPoll,
  pollResults,
  ranking,
  resultShareText,
  votePoll,
  winner,
  type MyPoll,
  type PollPlace,
  type PollResults as Results,
} from "../lib/polls";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

type Props = {
  poll: MyPoll;
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
 * Un sondage dans l'app (rafraîchi tout seul) : son vote à soi (❤️ / ✕ par resto, qu'on peut changer), les
 * restos par nombre de ❤️ avec « Go » sur le premier, puis partager le résultat, renvoyer le lien, et
 * supprimer le vote (si on l'a lancé) ou l'oublier (si on l'a rejoint par un lien).
 */
export function PollResults({ poll, onBack, onGone }: Props) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Son vote en cours d'édition (null : on montre celui enregistré, ou on n'a pas encore voté).
  const [draft, setDraft] = useState<boolean[] | null>(null);
  const [sending, setSending] = useState(false);

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

  const ranked = live ? ranking(live) : [];
  const best = Math.max(1, ranked[0]?.hearts ?? 0);
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
            {votes} · {timeLeft(live.expiresAt)}
          </Text>

          {/* Son vote : un ❤️ ou un ✕ par resto, à envoyer (ou à changer). */}
          <Text style={styles.section}>{t(live.mine ? "pollMyVote" : "pollYourTurn")}</Text>
          {live.places.map((place, i) => {
            const like = mine?.[i];
            const pick = (value: boolean) => {
              Haptics.selectionAsync();
              setDraft((d) => {
                const next = d ?? live.mine ?? live.places.map(() => false);
                return next.map((v, j) => (j === i ? value : v));
              });
            };
            return (
              <View key={`vote-${i}`} style={styles.voteRow}>
                <Text style={styles.voteName} numberOfLines={1}>
                  {place.name}
                </Text>
                <Pressable
                  style={[styles.choice, like === false && mine && styles.choiceNope]}
                  onPress={() => pick(false)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: like === false && !!mine }}
                  accessibilityLabel={`${t("nope")} ${place.name}`}
                >
                  <Text style={styles.choiceText}>✕</Text>
                </Pressable>
                <Pressable
                  style={[styles.choice, like === true && styles.choiceYum]}
                  onPress={() => pick(true)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: like === true }}
                  accessibilityLabel={`${t("yum")} ${place.name}`}
                >
                  <Text style={styles.choiceText}>❤️</Text>
                </Pressable>
              </View>
            );
          })}
          {draft && (
            <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={sendVote} disabled={sending} accessibilityRole="button">
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t(live.mine ? "pollChangeVote" : "pollSendVote")}</Text>}
            </Pressable>
          )}

          <Text style={styles.section}>{t("pollStandings")}</Text>
          {ranked.map(({ place, hearts }, i) => {
            const first = i === 0 && hearts > 0;
            const cuisine = place.cuisine ? cuisineLabel(place.cuisine) : null;
            return (
              <View key={`${place.name}-${i}`} style={[styles.row, first && styles.rowTop]}>
                <View style={styles.rowHead}>
                  <Text style={styles.name} numberOfLines={1}>
                    {top === place ? "🏆 " : ""}
                    {place.name}
                  </Text>
                  <Text style={styles.hearts}>❤️ {hearts}</Text>
                </View>
                {cuisine && (
                  <Text style={styles.info}>
                    {cuisine.emoji} {cuisine.label}
                  </Text>
                )}
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${(hearts / best) * 100}%` }]} />
                </View>
                {first && (
                  <Pressable
                    style={({ pressed }) => [styles.go, pressed && styles.pressed]}
                    onPress={() => openPlace(asRestaurant(place))}
                    accessibilityRole="link"
                    accessibilityLabel={t("seeInMaps", { name: place.name })}
                  >
                    <Text style={styles.goText}>{t("go")}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}

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
  content: { paddingBottom: 24, gap: 10 },
  sub: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginBottom: 4 },
  section: { fontFamily: fonts.medium, fontSize: 13, letterSpacing: 0.6, color: colors.accent, textTransform: "uppercase", marginTop: 8 },
  voteRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  voteName: { flex: 1, fontFamily: fonts.title, fontSize: 16, color: colors.ink },
  choice: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceNope: { backgroundColor: colors.line, borderColor: colors.muted },
  choiceYum: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  choiceText: { fontSize: 18, color: colors.muted },
  primary: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  primaryText: { fontFamily: fonts.title, fontSize: 16, color: "#fff" },
  row: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14 },
  rowTop: { borderWidth: 2, borderColor: colors.accent },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  name: { flex: 1, fontFamily: fonts.title, fontSize: 18, color: colors.ink },
  hearts: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  info: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 3 },
  bar: { height: 8, borderRadius: 99, backgroundColor: colors.accentSoft, marginTop: 10, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 99, backgroundColor: colors.accent },
  go: { marginTop: 12, alignSelf: "flex-start", backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  goText: { fontFamily: fonts.title, fontSize: 15, color: "#fff" },
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
