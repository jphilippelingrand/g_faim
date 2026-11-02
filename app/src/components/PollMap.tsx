import { useEffect, useRef, useState } from "react";
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
  /** Le resto touché dans la liste (ou sur la carte) : plus gros, et la carte va dessus. */
  focused: string | null;
  onSelect: (id: string) => void;
  /** On a déplacé ou zoomé la carte soi-même (pas nos recadrages) : la zone visible. */
  onMove?: (view: Area) => void;
  height?: number;
};

const PADDING = { top: 36, right: 36, bottom: 36, left: 36 };
// Au premier affichage : toi et les restos les plus proches de la liste.
const FIRST_FRAME = 8;
// Un resto touché : la carte va dessus, à cette échelle (en degrés, un pâté de maisons ou deux).
const FOCUS_DELTA = 0.005;

/** Plus grand cercle centré sur la carte qui tient dans la vue. */
function viewportCircle(region: Region): Area {
  const latMeters = (region.latitudeDelta / 2) * 111_320;
  const lngMeters = (region.longitudeDelta / 2) * 111_320 * Math.cos((region.latitude * Math.PI) / 180);
  return { center: { latitude: region.latitude, longitude: region.longitude }, radius: Math.round(Math.min(latMeters, lngMeters)) };
}

/**
 * La petite carte des votes : les restos proposés en gris, les cochés en rouge. Elle s'ouvre sur toi et les
 * restos d'à côté ; un resto touché, elle va dessus ; la sélection change, elle cadre tous les cochés (et
 * toi). On peut la déplacer pour chercher ailleurs (onMove).
 */
export function PollMap({ home, places, picked, focused, onSelect, onMove, height = 190 }: Props) {
  const map = useRef<MapView>(null);
  // La carte n'accepte un cadrage qu'une fois prête (avant, il était perdu : carte trop dézoomée).
  const [ready, setReady] = useState(false);
  // Nos recadrages ne comptent pas comme un déplacement.
  const ignoreUntil = useRef(0);
  // Tant qu'on n'a touché à rien (carte, ligne, case), le cadrage d'ouverture suit la liste : celle de la vue
  // principale d'abord, puis les restos d'à côté (fermés compris), souvent plus proches.
  const touched = useRef(false);
  const pickedIds = picked.map((r) => r.id);

  const fit = (points: LatLng[]) => {
    if (!map.current) return;
    ignoreUntil.current = Date.now() + 1500;
    map.current.fitToCoordinates([home, ...points], { edgePadding: PADDING, animated: true });
  };

  // Cadrage d'ouverture, dès que la carte est prête et à chaque nouvelle liste : toi et les plus proches (sans
  // la liste, comme dans un vote : ses restos).
  const placesKey = places.slice(0, FIRST_FRAME).map((r) => r.id).join();
  useEffect(() => {
    if (!ready || touched.current) return;
    const points = (places.length ? places.slice(0, FIRST_FRAME) : picked).map((r) => r.location);
    if (points.length) fit(points);
  }, [ready, placesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un resto touché : la carte va dessus, sans le cocher.
  useEffect(() => {
    const spot = [...picked, ...places].find((r) => r.id === focused);
    if (!ready || !spot || !map.current) return;
    touched.current = true;
    ignoreUntil.current = Date.now() + 1500;
    map.current.animateToRegion({ ...spot.location, latitudeDelta: FOCUS_DELTA, longitudeDelta: FOCUS_DELTA }, 350);
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // La sélection change (coché, décoché) : on cadre tous les cochés, avec toi.
  const pickedKey = pickedIds.join();
  const firstPicked = useRef(pickedKey);
  useEffect(() => {
    if (!ready || pickedKey === firstPicked.current) return;
    firstPicked.current = pickedKey;
    touched.current = true;
    if (picked.length) fit(picked.map((r) => r.location));
  }, [pickedKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

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
        onMapReady={() => {
          ignoreUntil.current = Date.now() + 1500;
          setReady(true);
        }}
        onRegionChangeComplete={(region) => {
          if (Date.now() < ignoreUntil.current) return;
          touched.current = true;
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
