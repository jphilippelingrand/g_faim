import Constants, { ExecutionEnvironment } from "expo-constants";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { MAX_RADIUS, type Area, type LatLng, type Restaurant } from "../lib/places";
import { colors, fonts } from "../theme";

// Les données Places doivent s'afficher sur une carte Google. Expo Go n'embarque pas
// Google Maps sur iOS : on y retombe sur Apple Maps, pour le dev uniquement.
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type Props = {
  home: LatLng;
  results: Restaurant[];
  area: Area | null;
  /** Incrémenté quand il faut recadrer la carte sur la maison + les résultats. */
  fitKey: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onViewportChange: (view: Area) => void;
  /** Hauteur cachée par la barre du haut et par le panneau du bas : la carte s'y adapte (logo Google visible, recadrage). */
  insets: { top: number; bottom: number };
};

/** Plus grand cercle centré sur la carte qui tient dans la vue. */
function viewportCircle(region: Region): Area {
  const latMeters = (region.latitudeDelta / 2) * 111_320;
  const lngMeters = (region.longitudeDelta / 2) * 111_320 * Math.cos((region.latitude * Math.PI) / 180);
  return {
    center: { latitude: region.latitude, longitude: region.longitude },
    radius: Math.min(Math.round(Math.min(latMeters, lngMeters)), MAX_RADIUS),
  };
}

export function RestaurantMap({ home, results, area, fitKey, selectedId, onSelect, onViewportChange, insets }: Props) {
  const map = useRef<MapView>(null);
  // Les changements de vue déclenchés par nos propres recadrages ne doivent pas relancer de recherche.
  const ignoreUntil = useRef(0);

  // Recadrage : seulement quand fitKey change (recherche initiale), pas après un dézoom.
  useEffect(() => {
    if (fitKey === 0 || !map.current) return;
    ignoreUntil.current = Date.now() + 1500;
    // On ajoute le symétrique de chaque resto par rapport à la maison pour rester centré sur toi.
    const points = results.flatMap(({ location: p }) => [
      p,
      { latitude: 2 * home.latitude - p.latitude, longitude: 2 * home.longitude - p.longitude },
    ]);
    map.current.fitToCoordinates([home, ...points], {
      // mapPadding exclut déjà la barre du haut et le panneau : on n'ajoute qu'une marge pour les pastilles.
      // (Les rajouter ici les comptait deux fois et décalait le point bleu vers le haut.)
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        // Le logo Google et le centre de la carte restent dans la partie visible, au-dessus du panneau.
        mapPadding={{ top: insets.top, right: 0, bottom: insets.bottom, left: 0 }}
        provider={IS_EXPO_GO ? undefined : PROVIDER_GOOGLE}
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
  pinSelected: { backgroundColor: colors.ink, transform: [{ scale: 1.25 }] },
  pinText: { color: "#fff", fontFamily: fonts.title, fontSize: 14 },
});
