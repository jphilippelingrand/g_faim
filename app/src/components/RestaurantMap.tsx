import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Circle, Marker, type Region } from "react-native-maps";
import type { Area, LatLng, Restaurant } from "../lib/places";
import { clusterize, regionOf } from "../lib/clusters";
import { ClusterDot, MapDot } from "./MapDot";

// Plans (Apple) sur iOS : gratuit, sans clé. Les restos viennent d'OpenStreetMap.

type Props = {
  home: LatLng;
  results: Restaurant[];
  /** Les autres restos de la zone visible : montrés aussi (regroupés quand ils sont serrés), derrière la pile. */
  around?: Restaurant[];
  /** La carte s'est arrêtée, nos recadrages compris : sa zone visible, pour y charger `around`. */
  onMapStop?: (box: Region) => void;
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

export function RestaurantMap({ home, results, around = [], onMapStop, area, fitKey, selectedId, onSelect, onViewportChange, insets }: Props) {
  const map = useRef<MapView>(null);
  // Les changements de vue déclenchés par nos propres recadrages ne doivent pas relancer de recherche.
  const ignoreUntil = useRef(0);

  // La carte n'accepte un recadrage qu'une fois prête : avant, il était perdu (au lancement surtout).
  const [ready, setReady] = useState(false);
  // L'utilisateur a bougé la carte depuis le dernier recadrage : on ne la reprend plus d'office.
  const userMoved = useRef(false);
  // La vue où la carte s'est arrêtée et sa largeur : pour regrouper les restos trop proches à ce zoom.
  const [region, setRegion] = useState<Region | null>(null);
  const [width, setWidth] = useState(0);
  // Le resto montré reste toujours seul (jamais dans un groupe).
  const { singles, clusters } = useMemo(
    () => {
      const inStack = new Set(results.map((r) => r.id));
      const all = [...results, ...around.filter((r) => !inStack.has(r.id))];
      return clusterize(all.filter((r) => r.id !== selectedId), region, width);
    },
    [results, around, selectedId, region, width],
  );
  const selectedSpot = results.find((r) => r.id === selectedId);
  const shown = selectedSpot ? [selectedSpot, ...singles] : singles;

  // Recadrage sur toi + le resto choisi, quand fitKey change (nouvelle recherche, carte glissée, ligne touchée),
  // quand la carte devient prête, et quand le panneau du bas change de hauteur (mesuré après le premier
  // affichage, ou passage cartes ↔ liste) tant qu'on n'a pas bougé la carte soi-même.
  useEffect(() => {
    userMoved.current = false;
  }, [fitKey]);
  useEffect(() => {
    if (fitKey === 0 || !ready || !map.current || userMoved.current) return;
    const place = results.find((r) => r.id === selectedId);
    if (!place) return;
    ignoreUntil.current = Date.now() + 1500;
    // Le milieu entre toi et le resto, zoomé au plus près. mapPadding exclut déjà la barre du haut et le panneau :
    // on n'ajoute que la marge des deux points (assez pour le point rouge et son halo).
    map.current.fitToCoordinates([home, place.location], { edgePadding: { top: 60, right: 70, bottom: 60, left: 70 }, animated: true });
  }, [fitKey, ready, insets.top, insets.bottom, insets.left]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        // Le logo Plans et le centre de la carte restent dans la partie visible, au-dessus du panneau.
        mapPadding={{ top: insets.top, right: 0, bottom: insets.bottom, left: insets.left ?? 0 }}
        initialRegion={{ ...home, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
        showsUserLocation
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        onMapReady={() => setReady(true)}
        onRegionChangeComplete={(region) => {
          setRegion(region);
          if (ready) onMapStop?.(region);
          if (Date.now() < ignoreUntil.current || !ready) return;
          userMoved.current = true;
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
        {shown.map((r, i) => {
          const selected = r.id === selectedId;
          return (
            <Marker
              // Remonter le marqueur quand il change d'état : avec tracksViewChanges coupé, sa vue n'est pas redessinée.
              key={`${r.id}-${selected}`}
              coordinate={r.location}
              onPress={() => onSelect(r.id)}
              // Seul le resto montré s'anime (MapDot) : lui seul est suivi.
              tracksViewChanges={selected}
              zIndex={selected ? 100 : 50 - i}
            >
              <MapDot state={selected ? "selected" : "idle"} open={r.open} />
            </Marker>
          );
        })}
        {clusters.map((c) => (
          <Marker
            key={`${c.key}-${c.members.length}-${c.open}`}
            coordinate={c.location}
            onPress={() => map.current?.animateToRegion(regionOf(c.members), 350)}
            tracksViewChanges={false}
            zIndex={60}
          >
            <ClusterDot count={c.members.length} open={c.open} />
          </Marker>
        ))}
      </MapView>
    </View>
  );
}
