import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cuisineLabel } from "../lib/osm";
import { distanceMeters, formatDistance, nearest, PAGE, type LatLng, type Restaurant } from "../lib/places";
import {
  createPoll,
  myPolls,
  pollResults,
  POLL_MAX,
  POLL_MIN,
  POLL_TTLS,
  type MyPoll,
  type PollResults as Results,
  type PollTtl,
  winner,
} from "../lib/polls";
import { PollResults, timeLeft } from "./PollResults";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

type Props = {
  visible: boolean;
  /** Les restos déjà trouvés (ouverts) : affichés le temps de charger ceux d'à côté, fermés compris. */
  places: Restaurant[];
  home: LatLng;
  /** Le resto affiché à l'ouverture : coché d'office (la feuille est remontée à chaque ouverture). */
  preselected?: string;
  /** Un sondage à montrer tout de suite (lien de vote ouvert dans l'app). */
  initialPoll?: MyPoll | null;
  onClose: () => void;
};

const TTL_LABEL = { "1h": "pollTtlHour", "1d": "pollTtlDay", "1w": "pollTtlWeek" } as const;

/**
 * Les copains : en haut, ses sondages en cours (le resto en tête, les votes ; un tap montre les résultats,
 * le lien à renvoyer, la suppression) ; en dessous, un nouveau : on coche 2 à 5 restos, on choisit combien de temps le vote reste
 * ouvert, et la feuille de partage d'iOS envoie le lien. On vote souvent pour plus tard : la liste prend
 * tous les restos autour, même fermés en ce moment (c'est indiqué).
 */
export function PollSheet({ visible, places, home, preselected, initialPoll, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string[]>(preselected ? [preselected] : []);
  const [ttl, setTtl] = useState<PollTtl>("1h");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // Relu à chaque ouverture (la feuille est remontée) : un lien rejoint entre-temps y figure.
  const [running, setRunning] = useState<MyPoll[]>(myPolls);
  const [statuses, setStatuses] = useState<Record<string, Results>>({});
  // Le sondage dont on regarde les résultats.
  const [opened, setOpened] = useState<MyPoll | null>(initialPoll ?? null);
  const [choices, setChoices] = useState<Restaurant[]>(places);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  // Les restos autour, fermés compris. Le resto coché d'office reste en tête.
  const fetchChoices = (count: number) =>
    nearest(home, count)
      .then((search) => {
        const kept = places.filter((r) => r.id === preselected);
        setChoices([...kept, ...search.list.filter((r) => r.id !== preselected)]);
        setHasMore(search.hasMore);
      })
      .catch((err) => {
        console.error(err);
        setHasMore(false);
      })
      .finally(() => setLoading(false));
  useEffect(() => {
    if (visible && home.latitude) fetchChoices(PAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  // La suite quand on approche du bas de la liste.
  const loadMore = () => {
    if (loading || !hasMore) return;
    setLoading(true);
    fetchChoices(choices.length + PAGE);
  };

  // Où en sont ses sondages : une lecture chacun à l'ouverture, et au retour des résultats.
  useEffect(() => {
    if (opened) return;
    for (const poll of running) {
      pollResults(poll)
        .then((status) => setStatuses((s) => ({ ...s, [poll.url]: status })))
        .catch(console.error);
    }
  }, [running, opened]);

  const gone = (poll: MyPoll) => {
    setRunning((r) => r.filter((p) => p.url !== poll.url));
    setOpened(null);
  };

  const toggle = (id: string) => {
    Haptics.selectionAsync();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < POLL_MAX ? [...p, id] : p));
  };

  async function create() {
    setBusy(true);
    setError(false);
    try {
      // Dans l'ordre de la liste (du plus proche au plus loin), pas dans l'ordre des coches.
      const chosen = choices.filter((r) => picked.includes(r.id));
      const { url } = await createPoll(chosen, ttl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Partager avant de fermer : iOS refuse d'ouvrir une feuille pendant qu'une autre se ferme.
      await Share.share({ message: `${t("pollShareText")} ${url}` });
      onClose();
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const ready = picked.length >= POLL_MIN;
  const shown = running.filter((p) => statuses[p.url] !== "expired");

  const runningSection = shown.length > 0 && (
    <View style={styles.running}>
      <Text style={styles.section}>{t("pollRunning")}</Text>
      {shown.map((poll) => {
        const status = statuses[poll.url];
        const live = status && status !== "expired" ? status : null;
        const leader = live && winner(live);
        const votes = !live
          ? "…"
          : live.voters === 0
            ? t("pollNoVotes")
            : live.voters === 1
              ? t("pollOneVote")
              : t("pollVotes", { n: live.voters });
        return (
          <Pressable
            key={poll.url}
            style={({ pressed }) => [styles.poll, pressed && styles.rowPressed]}
            onPress={() => setOpened(poll)}
            accessibilityRole="button"
          >
            <View style={styles.middle}>
              <Text style={styles.name} numberOfLines={1}>
                {leader ? `🏆 ${leader.name}` : poll.names.join(" · ")}
              </Text>
              <Text style={styles.info} numberOfLines={1}>
                {votes} · {timeLeft(poll.expiresAt)}
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        );
      })}
      <Text style={styles.section}>{t("pollNew")}</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("pollTitle")}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("cancel")}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        {opened ? (
          <PollResults poll={opened} onBack={() => setOpened(null)} onGone={gone} />
        ) : (
          <>
            <FlatList
              style={styles.list}
              data={choices}
              keyExtractor={(r) => r.id}
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={loading ? <ActivityIndicator style={styles.more} color={colors.accent} /> : undefined}
              ListHeaderComponent={
                <>
                  {runningSection}
                  <Text style={styles.sub}>{t("pollHowTo", { min: POLL_MIN, max: POLL_MAX })}</Text>
                </>
              }
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const on = picked.includes(item.id);
                const cuisine = item.cuisine ? cuisineLabel(item.cuisine) : null;
                const info = [
                  cuisine && `${cuisine.emoji} ${cuisine.label}`,
                  formatDistance(distanceMeters(home, item.location)),
                  item.open === false && t("pollClosedNow"),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Pressable
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => toggle(item.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on, disabled: !on && picked.length >= POLL_MAX }}
                  >
                    <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={styles.checkMark}>✓</Text>}</View>
                    <View style={styles.middle}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.info} numberOfLines={1}>
                        {info}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />

            <Text style={styles.label}>{t("pollTtl")}</Text>
            <View style={styles.ttls}>
              {POLL_TTLS.map((value) => (
                <Pressable
                  key={value}
                  style={[styles.ttl, ttl === value && styles.ttlOn]}
                  onPress={() => setTtl(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ttl === value }}
                >
                  <Text style={[styles.ttlText, ttl === value && styles.ttlTextOn]}>{t(TTL_LABEL[value])}</Text>
                </Pressable>
              ))}
            </View>

            {error && <Text style={styles.error}>{t("oops")}</Text>}
            <Pressable
              style={({ pressed }) => [styles.create, !ready && styles.createOff, pressed && ready && styles.pressed]}
              onPress={create}
              disabled={!ready || busy}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>{t("pollCreate", { n: picked.length })}</Text>}
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 18, paddingTop: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  title: { fontFamily: fonts.grr, fontSize: 30, color: colors.ink },
  close: { fontSize: 22, color: colors.muted },
  sub: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginBottom: 6 },
  list: { flex: 1 },
  running: { marginTop: 6 },
  section: {
    fontFamily: fonts.medium,
    fontSize: 13,
    letterSpacing: 0.6,
    color: colors.accent,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 8,
  },
  poll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  arrow: { fontSize: 26, color: colors.muted },
  more: { marginVertical: 14 },
  separator: { height: 1, backgroundColor: colors.line, marginLeft: 44 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11 },
  rowPressed: { opacity: 0.6 },
  check: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: "#fff", fontSize: 17, fontFamily: fonts.title },
  middle: { flex: 1 },
  name: { fontFamily: fonts.title, fontSize: 17, color: colors.ink },
  info: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, marginTop: 3 },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, marginTop: 14, marginBottom: 8 },
  ttls: { flexDirection: "row", gap: 8 },
  ttl: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  ttlOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  ttlText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  ttlTextOn: { color: colors.accent },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.accent, textAlign: "center", marginTop: 12 },
  create: { marginTop: 14, backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 15, alignItems: "center" },
  createOff: { opacity: 0.4 },
  createText: { fontFamily: fonts.title, fontSize: 17, color: "#fff" },
  pressed: { transform: [{ scale: 0.97 }] },
});
