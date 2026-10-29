import { StyleSheet, Text, View } from "react-native";
import { formatClosingTime, formatDistance, travelTime, type Restaurant } from "../lib/places";
import { cuisineLabel } from "../lib/osm";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

type Props = {
  r: Restaurant;
  distance: number;
};

// En dessous, l'heure de fermeture passe au rouge.
const CLOSING_SOON = 60;

const LINES = ["verdict1", "verdict2", "verdict3", "verdict4", "verdict5"] as const;

/** Une phrase du ventre par resto, toujours la même pour lui. */
function lineFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return LINES[Math.abs(hash) % LINES.length];
}

/**
 * Une carte, copie de src/components/PlaceCard.tsx (site), style étiquette un peu rétro : une phrase du
 * ventre, le nom en grand, une ligne d'infos, et le temps pour y aller.
 */
export function PlaceCard({ r, distance }: Props) {
  const trip = travelTime(distance);
  const cuisine = r.cuisine ? cuisineLabel(r.cuisine) : null;
  const closing =
    r.closesIn === undefined ? null : r.closesIn === Infinity ? t("openAllDay") : t("until", { time: formatClosingTime(r.closesIn) });
  const soon = r.closesIn !== undefined && r.closesIn < CLOSING_SOON;
  const info = [cuisine && `${cuisine.emoji} ${cuisine.label}`, formatDistance(distance)].filter(Boolean).join(" · ");

  return (
    <View style={styles.card}>
      <Text style={styles.line}>{t(lineFor(r.id))}</Text>
      <Text style={styles.name} numberOfLines={2}>
        {r.name}
      </Text>
      <Text style={styles.info} numberOfLines={1}>
        {info}
        {closing && (
          <>
            {" · "}
            <Text style={soon && styles.soon}>{closing}</Text>
          </>
        )}
      </Text>
      <Text style={styles.time} accessibilityLabel={t(trip.mode === "walk" ? "walkMinutes" : "driveMinutes", { minutes: trip.minutes })}>
        {trip.mode === "walk" ? "🚶" : "🚗"} <Text style={styles.minutes}>{trip.minutes}</Text> min
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: colors.accent,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  line: { fontFamily: fonts.grr, fontSize: 15, color: colors.accent, textAlign: "center" },
  name: { fontFamily: fonts.title, fontSize: 25, lineHeight: 29, color: colors.ink, textAlign: "center", marginTop: 6 },
  info: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 6 },
  soon: { color: colors.accent, fontFamily: fonts.medium },
  time: { fontFamily: fonts.medium, fontSize: 15, color: colors.accent, marginTop: 8 },
  minutes: { fontFamily: fonts.title, fontSize: 32 },
});
