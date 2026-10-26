import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { directionsUrl, formatDistance, type LatLng, type Restaurant } from "../lib/places";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

type Props = {
  r: Restaurant;
  index: number;
  home: LatLng;
  distance: number;
  selected: boolean;
  onSelect: (id: string) => void;
};

export function RestaurantCard({ r, index, home, distance, selected, onSelect }: Props) {
  const details = [r.type, r.price, formatDistance(distance)].filter(Boolean).join(" · ");

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <Text style={styles.rank}>
        {index + 1}
      </Text>

      <Pressable
        style={styles.main}
        onPress={() => {
          onSelect(r.id);
          Linking.openURL(r.url);
        }}
        accessibilityRole="link"
        accessibilityHint={t("openInMaps")}
      >
        <Text style={styles.name} numberOfLines={2}>
          {r.name}
        </Text>
        <Text style={styles.meta}>
          <Text style={styles.star}>★</Text> <Text style={styles.rating}>{r.rating.toFixed(1)}</Text> · {r.reviews} {t("reviews")}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {details}
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.go, pressed && styles.goPressed]}
        onPress={() => Linking.openURL(directionsUrl(home, r, distance))}
        accessibilityRole="link"
        accessibilityLabel={t("directionsTo", { name: r.name })}
        hitSlop={8}
      >
        {({ pressed }) => (
          <Svg viewBox="0 0 24 24" width={20} height={20}>
            <Path
              d="M21.7 11.3l-9-9a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4zM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5z"
              fill={pressed ? "#fff" : colors.accent}
            />
          </Svg>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
  },
  // Bordure plus épaisse : on retire 1 px de marge pour que le contenu ne bouge pas.
  cardSelected: { borderColor: colors.accent, borderWidth: 2, paddingVertical: 13, paddingLeft: 15, paddingRight: 11 },
  // Le numéro du classement tient lieu de vignette : grand, en tête de carte.
  rank: { minWidth: 22, textAlign: "center", color: colors.accent, fontFamily: fonts.title, fontSize: 30, lineHeight: 34 },
  main: { flex: 1 },
  name: { fontFamily: fonts.title, fontSize: 17, color: colors.ink, lineHeight: 21 },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  star: { color: colors.accent },
  rating: { color: colors.ink, fontFamily: fonts.medium },
  go: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  goPressed: { backgroundColor: colors.accent },
});
