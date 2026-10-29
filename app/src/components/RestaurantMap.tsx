import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, type Region } from "react-native-maps";
import type { Area, LatLng, Restaurant } from "../lib/places";
import { colors, fonts } from "../theme";

// Plans (Apple) sur iOS : gratuit, sans clé. Les restos viennent d'OpenStreetMap.

type Props = {
  home: LatLng;
  results: Restaurant[];
  area: Area | null;
  /** Incrémenté quand il faut recadrer la carte sur la maison + les résultats. */
  fitKey: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onViewportChange: (view: Area) => void;
  /** Hauteur cachée par la barre du haut et par le panneau du bas : la carte s'y adapte (logo Plans visible, recadrage). */
  insets: { top: number; bottom: number; left?: number };
};

/** Plus grand cercle centré sur la carte qui tient dans la vue. */
function viewportCircle(region: Region): Area {
  const latMeters = (region.latitudeDelta / 2) * 111_320;
  const lngMeters = (region.longitudeDelta / 2) * 111_320 * Math.cos((region.latitude * Math.PI) / 180);
  return {
    center: { latitude: region.latitude, longitude: region.longitude },
    radius: Math.round(Math.min(latMeters, lngMeters)),
  };
}

export function RestaurantMap({ home, results, area, fitKey, selectedId, onSelect, onViewportChange, insets }: Props) {
  const map = useRef<MapView>(null);
  // Les changements de vue déclenchés par nos propres recadrages ne doivent pas relancer de recherche.
  const ignoreUntil = useRef(0);

  // Recadrage sur toi + le resto de la carte du dessus, quand fitKey change (nouvelle recherche, carte glissée).
  useEffect(() => {
    if (fitKey === 0 || !map.current) return;
    ignoreUntil.current = Date.now() + 1500;
    const place = results.find((r) => r.id === selectedId);
    if (!place) return;
    // Le symétrique du resto par rapport à toi : le cadre reste centré sur toi.
    const p = place.location;
    map.current.fitToCoordinates([p, { latitude: 2 * home.latitude - p.latitude, longitude: 2 * home.longitude - p.longitude }], {
      // mapPadding exclut déjà la barre du haut et le panneau : on n'ajoute qu'une marge pour les pastilles.
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        // Le logo Plans et le centre de la carte restent dans la partie visible, au-dessus du panneau.
        mapPadding={{ top: insets.top, right: 0, bottom: insets.bottom, left: insets.left ?? 0 }}
        initialRegion={{ ...home, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
        showsUserLocation
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        onRegionChangeComplete={(region) => {
          if (Date.now() < ignoreUntil.current) return;
          onViewportChange(viewportCircle(region));
        }}
      >
        {area && (
          <Circle
            center={area.center}
            radius={area.radius}
            strokeColor="rgba(226, 88, 62, 0.5)"
            strokeWidth={1.5}
            fillColor="rgba(226, 88, 62, 0.05)"
          />
        )}
        {results.map((r, i) => {
          const selected = r.id === selectedId;
          return (
            <Marker
              // Remonter le marqueur quand il change d'état : avec tracksViewChanges coupé, sa vue n'est pas redessinée.
              key={`${r.id}-${selected}`}
              coordinate={r.location}
              onPress={() => onSelect(r.id)}
              tracksViewChanges={false}
              zIndex={selected ? 100 : 50 - i}
            >
              <View style={[styles.pin, selected && styles.pinSelected]}>
                <Text style={styles.pinText}>{i + 1}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    borderWidth: 2.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinSelected: { opacity: 1, transform: [{ scale: 1.3 }] },
  pinText: { color: "#fff", fontFamily: fonts.title, fontSize: 14 },
});
