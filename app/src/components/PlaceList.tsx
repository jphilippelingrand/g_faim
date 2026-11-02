import { useEffect, useRef } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { cuisineLabel } from "../lib/osm";
import type { MapsApp } from "../lib/mapsApp";
import { OpenInMaps } from "./OpenInMaps";
import { distanceMeters, formatClosingTime, travelTime, type LatLng, type Restaurant } from "../lib/places";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

type Props = {
  places: Restaurant[];
  home: LatLng;
  current: number;
  /** Une ligne touchée : la carte la montre. */
  onChange: (index: number) => void;
  onMapsApp: (app: MapsApp) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onNeedMore: () => void;
};

// En dessous, l'heure de fermeture passe au rouge (comme PlaceCard).
const CLOSING_SOON = 60;

/**
 * Le mode liste : les restos (ouverts seulement, ou tous selon le filtre « Ouverts »), du plus proche au plus loin, sans fin (la suite se charge en
 * descendant). Toucher une ligne la montre sur la carte ; le bouton ↗ ouvre sa fiche dans Plans ou Google Maps.
 */
export function PlaceList({ places, home, current, onChange, onMapsApp, hasMore, loadingMore, onNeedMore }: Props) {
  const list = useRef<FlatList<Restaurant>>(null);
  // La ligne touchée ici : elle est déjà sous le doigt, pas besoin de faire défiler.
  const tapped = useRef(-1);

  // Une épingle touchée sur la carte : la liste va à sa ligne.
  useEffect(() => {
    if (current === tapped.current || current >= places.length) return;
    list.current?.scrollToIndex({ index: current, viewPosition: 0.3, animated: true });
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  // Une nouvelle recherche (autre premier resto) : retour en haut. La suite chargée ne change pas le premier.
  const firstId = places[0]?.id;
  useEffect(() => {
    tapped.current = -1;
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [firstId]);

  return (
    <FlatList
      ref={list}
      data={places}
      keyExtractor={(r) => r.id}
      renderItem={({ item, index }) => {
        const select = () => {
          tapped.current = index;
          onChange(index);
        };
        return <Row r={item} home={home} selected={index === current} onPress={select} onMapsApp={onMapsApp} />;
      }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      onEndReached={() => hasMore && !loadingMore && onNeedMore()}
      onEndReachedThreshold={0.8}
      onScrollToIndexFailed={({ index }) => list.current?.scrollToOffset({ offset: index * 72, animated: true })}
      ListFooterComponent={
        <View style={styles.footer}>
          {hasMore || loadingMore ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.footerText}>{t("allSeen")}</Text>
          )}
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

type RowProps = {
  r: Restaurant;
  home: LatLng;
  selected: boolean;
  onPress: () => void;
  onMapsApp: (app: MapsApp) => void;
};

function Row({ r, home, selected, onPress, onMapsApp }: RowProps) {
  const distance = distanceMeters(home, r.location);
  const trip = travelTime(distance);
  const cuisine = r.cuisine ? cuisineLabel(r.cuisine) : null;
  // Fermé (filtre « Ouverts » coupé) : on le dit, plutôt qu'une heure de fermeture déjà passée.
  const closed = r.open === false;
  const closing = closed
    ? t("closedNow")
    : r.closesIn === undefined
      ? null
      : r.closesIn === Infinity
        ? t("openAllDay")
        : t("until", { time: formatClosingTime(r.closesIn) });
  const soon = closed || (r.closesIn !== undefined && r.closesIn < CLOSING_SOON);
  // Le temps pour y aller plutôt que la distance : c'est ce qui compte quand on a faim.
  const info = [cuisine && `${cuisine.emoji} ${cuisine.label}`, `${trip.mode === "walk" ? "🚶" : "🚗"} ${trip.minutes} min`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={[styles.dot, selected && styles.dotSelected]} />
      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
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
      </View>
      <OpenInMaps place={r} onMapsApp={onMapsApp} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14 },
  rowSelected: { backgroundColor: colors.accentSoft },
  rowPressed: { opacity: 0.7 },
  separator: { height: 1, backgroundColor: colors.line, marginLeft: 34 },
  // Le même point que sur la carte : gris, rouge pour la ligne montrée sur la carte.
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.muted },
  dotSelected: { backgroundColor: colors.accent },
  middle: { flex: 1 },
  name: { fontFamily: fonts.title, fontSize: 17, color: colors.ink },
  info: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, marginTop: 3 },
  soon: { color: colors.accent, fontFamily: fonts.medium },
  footer: { paddingVertical: 18, alignItems: "center" },
  footerText: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
});
