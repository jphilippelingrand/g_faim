import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { LatLng, Restaurant } from "../lib/places";
import { MapDot } from "./MapDot";
import { colors } from "../theme";

type Props = {
  home: LatLng;
  places: Restaurant[];
  /** Les restos cochés pour le vote : en rouge. */
  picked: string[];
  /** Le resto touché dans la liste (ou sur la carte) : plus gros, et la carte le cadre avec toi. */
  focused: string | null;
  onSelect: (id: string) => void;
};

const PADDING = { top: 30, right: 30, bottom: 30, left: 30 };

/**
 * La carte du vote : les restos proposés en gris, ceux qu'on a cochés en rouge. Elle cadre le resto touché
 * avec toi, sinon toi et ta sélection.
 */
export function PollMap({ home, places, picked, focused, onSelect }: Props) {
  const map = useRef<MapView>(null);

  useEffect(() => {
    const spot = places.find((r) => r.id === focused);
    const chosen = places.filter((r) => picked.includes(r.id)).map((r) => r.location);
    const points = spot ? [spot.location] : chosen;
    if (points.length) map.current?.fitToCoordinates([home, ...points], { edgePadding: PADDING, animated: true });
    // Recadrer seulement quand on touche un resto ou change la sélection, pas au chargement de la suite.
  }, [focused, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.box}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...home, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
        showsUserLocation
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {places.map((r, i) => {
          const state = r.id === focused ? "selected" : picked.includes(r.id) ? "picked" : "idle";
          return (
            <Marker
              key={`${r.id}-${state}`}
              coordinate={r.location}
              onPress={() => onSelect(r.id)}
              tracksViewChanges={state === "selected"}
              zIndex={state === "selected" ? 200 : state === "picked" ? 100 : 50 - Math.min(i, 49)}
            >
              <MapDot state={state} />
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 190, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: colors.line, marginTop: 8 },
});
