import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import type { Area, LatLng, Restaurant } from "../lib/places";
import { MapDot } from "./MapDot";
import { colors } from "../theme";

type Props = {
  home: LatLng;
  /** Les restos proposés autour : en gris. */
  places: Restaurant[];
  /** Les restos cochés (ou ceux du vote) : en rouge, même s'ils ne sont plus dans la liste. */
  picked: Restaurant[];
  /** Le resto touché dans la liste (ou sur la carte) : plus gros, et la carte le cadre avec toi. */
  focused: string | null;
  onSelect: (id: string) => void;
  /** On a déplacé ou zoomé la carte soi-même (pas nos recadrages) : la zone visible. */
  onMove?: (view: Area) => void;
  height?: number;
};

const PADDING = { top: 30, right: 30, bottom: 30, left: 30 };

/** Plus grand cercle centré sur la carte qui tient dans la vue. */
function viewportCircle(region: Region): Area {
  const latMeters = (region.latitudeDelta / 2) * 111_320;
  const lngMeters = (region.longitudeDelta / 2) * 111_320 * Math.cos((region.latitude * Math.PI) / 180);
  return { center: { latitude: region.latitude, longitude: region.longitude }, radius: Math.round(Math.min(latMeters, lngMeters)) };
}

/**
 * La petite carte des votes : les restos proposés en gris, les cochés en rouge. Elle cadre le resto touché
 * avec toi, sinon toi et les cochés ; on peut la déplacer pour chercher ailleurs (onMove).
 */
export function PollMap({ home, places, picked, focused, onSelect, onMove, height = 190 }: Props) {
  const map = useRef<MapView>(null);
  // Nos recadrages ne comptent pas comme un déplacement.
  const ignoreUntil = useRef(0);
  const pickedIds = picked.map((r) => r.id);

  useEffect(() => {
    const spot = [...picked, ...places].find((r) => r.id === focused);
    const points = spot ? [spot.location] : picked.map((r) => r.location);
    if (!points.length) return;
    ignoreUntil.current = Date.now() + 1500;
    map.current?.fitToCoordinates([home, ...points], { edgePadding: PADDING, animated: true });
    // Recadrer seulement quand on touche un resto ou change la sélection, pas quand la liste se recharge.
  }, [focused, pickedIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Les cochés d'abord (dessinés par-dessus), puis les autres restos proposés.
  const shown = [...picked, ...places.filter((r) => !pickedIds.includes(r.id))];

  return (
    <View style={[styles.box, { height }]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...home, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
        showsUserLocation
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onMapReady={() => (ignoreUntil.current = Date.now() + 1500)}
        onRegionChangeComplete={(region) => {
          if (Date.now() < ignoreUntil.current) return;
          onMove?.(viewportCircle(region));
        }}
      >
        {shown.map((r, i) => {
          const state = r.id === focused ? "selected" : pickedIds.includes(r.id) ? "picked" : "idle";
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
  box: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: colors.line, marginTop: 8 },
});
