import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { directionsUrl, formatDistance, googleHeaders, type LatLng, type Restaurant } from "../lib/places";
import { colors, fonts } from "../theme";

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
      <View style={styles.rank}>
        <Text style={styles.rankText}>{index + 1}</Text>
      </View>

      <Pressable
        style={styles.main}
        onPressIn={() => onSelect(r.id)}
        onPress={() => Linking.openURL(r.url)}
        accessibilityRole="link"
        accessibilityHint="Ouvre la fiche Google Maps"
      >
        {r.photo ? (
          <Image style={styles.thumb} source={{ uri: r.photo, headers: googleHeaders }} />
        ) : (
          <View style={styles.thumb}>
            <Text style={styles.thumbEmoji}>🍽️</Text>
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>
            {r.name}
          </Text>
          <Text style={styles.meta}>
            <Text style={styles.star}>★</Text> <Text style={styles.rating}>{r.rating.toFixed(1)}</Text> · {r.reviews} avis
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {details}
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.go, pressed && styles.goPressed]}
        onPress={() => Linking.openURL(directionsUrl(home, r, distance))}
        accessibilityRole="link"
        accessibilityLabel={`Itinéraire vers ${r.name}`}
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
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 12,
  },
  cardSelected: { borderColor: colors.accent, borderWidth: 2, padding: 11 },
  rank: {
    position: "absolute",
    top: -8,
    left: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  rankText: { color: colors.bg, fontFamily: fonts.title, fontSize: 13 },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbEmoji: { fontSize: 28 },
  body: { flex: 1 },
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
