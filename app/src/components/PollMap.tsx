import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { distanceMeters, type Box, type LatLng, type Restaurant } from "../lib/places";
import { clusterize, regionOf } from "../lib/clusters";
import { ClusterDot, MapDot } from "./MapDot";
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
  /** La carte s'est arrêtée (cadrage, ou déplacée au doigt) : la zone visible, pour y charger les restos. */
  onView?: (box: Box) => void;
  /** Des restos à cadrer dès qu'ils changent (les résultats d'une recherche par nom), sans toi. */
  frame?: Restaurant[];
  height?: number;
};

// Autour des points cadrés : la boîte qui les contient, doublée (les points restent loin des bords, halo
// compris), et jamais plus serrée qu'un pâté de maisons.
const MARGIN = 2;
const MIN_DELTA = 0.003;
// Au premier affichage : toi et les restos les plus proches de la liste.
const FIRST_FRAME = 8;
// Le resto déjà coché (celui qu'on regardait) entre dans le cadrage d'ouverture s'il n'est pas plus loin que ça.
const NEAR_PICKED = 1000;
// Un resto touché : la carte va dessus, à cette échelle (en degrés, un pâté de maisons ou deux).
const FOCUS_DELTA = 0.005;

/**
 * La région qui montre tous ces points. Calculée ici plutôt que par fitToCoordinates : celui-ci dépend de la
 * taille de la carte au moment de l'appel, encore fausse pendant que la feuille glisse (carte trop dézoomée).
 */
function regionAround(points: LatLng[]): Region {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * MARGIN, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * MARGIN, MIN_DELTA),
  };
}

/**
 * La petite carte des votes : les restos proposés en gris, les cochés en rouge. Elle s'ouvre sur toi et les
 * restos d'à côté ; un resto touché, elle va dessus ; la sélection change, elle cadre tous les cochés (sans
 * toi). Chaque fois qu'elle s'arrête, elle donne sa zone visible (onView) : on y charge tous les restos.
 */
export function PollMap({ home, places, picked, focused, onSelect, onView, frame, height = 190 }: Props) {
  const map = useRef<MapView>(null);
  // La carte n'accepte un cadrage qu'une fois prête (avant, il était perdu : carte trop dézoomée).
  const [ready, setReady] = useState(false);
  // Un doigt sur la carte depuis notre dernier cadrage : seul ce déplacement-là arrête le cadrage d'ouverture.
  // (La carte annonce aussi des déplacements toute seule : à l'ouverture, avant même d'être prête, et pendant
  // nos cadrages.)
  const finger = useRef(false);
  // Tant qu'on n'a touché à rien (carte, ligne, case), le cadrage d'ouverture suit la liste : celle de la vue
  // principale d'abord, puis les restos d'à côté (fermés compris), souvent plus proches.
  const touched = useRef(false);
  const pickedIds = picked.map((r) => r.id);
  // La vue où la carte s'est arrêtée et sa largeur : pour regrouper les restos trop proches à ce zoom.
  const [region, setRegion] = useState<Region | null>(null);
  const [width, setWidth] = useState(0);

  /** Cadre ces points ; avec `withHome`, toi aussi. */
  const fit = (points: LatLng[], withHome = true) => {
    if (!map.current) return;
    finger.current = false;
    map.current.animateToRegion(regionAround(withHome ? [home, ...points] : points), 350);
  };

  // Cadrage d'ouverture, dès que la carte est prête et à chaque nouvelle liste : toi et les plus proches (sans
  // la liste, comme dans un vote : ses restos).
  const placesKey = places.slice(0, FIRST_FRAME).map((r) => r.id).join();
  useEffect(() => {
    if (!ready || touched.current) return;
    const near = picked.filter((r) => distanceMeters(home, r.location) <= NEAR_PICKED);
    const points = (places.length ? [...places.slice(0, FIRST_FRAME), ...near] : picked).map((r) => r.location);
    if (points.length) fit(points);
  }, [ready, placesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un resto touché : la carte va dessus, sans le cocher.
  useEffect(() => {
    const spot = [...picked, ...places].find((r) => r.id === focused);
    if (!ready || !spot || !map.current) return;
    touched.current = true;
    finger.current = false;
    map.current.animateToRegion({ ...spot.location, latitudeDelta: FOCUS_DELTA, longitudeDelta: FOCUS_DELTA }, 350);
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // La sélection change (coché, décoché) : on cadre les cochés seulement, autour de leur centre (sans toi : on
  // vote souvent pour un resto ailleurs). Un seul coché : la carte va dessus, comme un resto touché.
  const pickedKey = pickedIds.join();
  const firstPicked = useRef(pickedKey);
  useEffect(() => {
    if (!ready || pickedKey === firstPicked.current) return;
    firstPicked.current = pickedKey;
    touched.current = true;
    if (picked.length) fit(picked.map((r) => r.location), false);
  }, [pickedKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Une recherche par nom a trouvé des restos : on les cadre (sans toi : ils sont peut-être à l'autre bout de la ville).
  const frameKey = frame?.map((r) => r.id).join() ?? "";
  useEffect(() => {
    if (!ready || !frame?.length) return;
    touched.current = true;
    fit(frame.map((r) => r.location), false);
  }, [frameKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Les cochés d'abord (dessinés par-dessus), puis les autres restos proposés : ceux-là, regroupés quand ils sont
  // trop serrés (les cochés et celui qu'on regarde restent toujours seuls).
  const { singles, clusters } = useMemo(
    () => clusterize(places.filter((r) => !pickedIds.includes(r.id) && r.id !== focused), region, width),
    [places, pickedKey, focused, region, width], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const focusedSpot = places.find((r) => r.id === focused && !pickedIds.includes(r.id));
  const shown = [...picked, ...(focusedSpot ? [focusedSpot] : []), ...singles];

  return (
    <View
      style={[styles.box, { height }]}
      onTouchStart={() => (finger.current = true)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...home, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
        showsUserLocation
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onMapReady={() => setReady(true)}
        onRegionChangeComplete={(region) => {
          if (!ready) return;
          setRegion(region);
          if (finger.current) touched.current = true;
          onView?.(region);
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
              {/* Au vote, tout est neutre sauf les cochés : ouvert ou fermé, c'est la liste qui le dit. */}
              <MapDot state={state} open={r.open} neutral={state !== "picked" && !pickedIds.includes(r.id)} />
            </Marker>
          );
        })}
        {clusters.map((c) => (
          <Marker
            key={`${c.key}-${c.members.length}-${c.open}`}
            coordinate={c.location}
            onPress={() => {
              touched.current = true;
              finger.current = false;
              map.current?.animateToRegion(regionOf(c.members), 350);
            }}
            tracksViewChanges={false}
            zIndex={60}
          >
            <ClusterDot count={c.members.length} open={false} />
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: colors.line, marginTop: 8 },
});
