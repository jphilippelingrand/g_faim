import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { distanceMeters, type Area, type Box, type LatLng, type Restaurant } from "../lib/places";
import { boxOf, clusteredPlaces, marker, selectedDot } from "./mapDots";
import { t } from "../i18n";

// Fond de carte OpenFreeMap : gratuit, sans clé ni quota, données OpenStreetMap.
export const STYLE = "https://tiles.openfreemap.org/styles/positron";
const ACCENT = "#e2583e";

type Props = {
  home: LatLng;
  results: Restaurant[];
  /** Les autres restos de la zone visible : montrés aussi (regroupés quand ils sont serrés), derrière la pile. */
  around: Restaurant[];
  /** La carte s'est arrêtée, nos recadrages compris : sa zone visible, pour y charger `around`. */
  onMapStop: (box: Box) => void;
  area: Area | null;
  /** Incrémenté quand il faut recadrer la carte sur toi + le resto choisi. */
  fitKey: number;
  selectedId: string | null;
  /** Ce que la fiche cache de la carte (en px) : on cadre dans le reste. */
  insets: { bottom: number; left: number };
  onSelect: (id: string) => void;
  /** Quand l'utilisateur déplace ou zoome la carte (pas quand on la recadre nous-mêmes). */
  onViewportChange: (view: Area) => void;
  /** Étiquettes posées en haut à gauche de la carte. */
  children?: ReactNode;
};

/** Le cercle en polygone GeoJSON (MapLibre ne dessine pas de cercle en mètres). */
function circlePolygon({ center, radius }: Area) {
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [center.lng + dLng * Math.cos(a), center.lat + dLat * Math.sin(a)];
  });
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } };
}

/** Plus grand cercle centré sur la carte qui tient dans la vue. */
function viewportCircle(map: maplibregl.Map): Area {
  const c = map.getCenter();
  const center = { lat: c.lat, lng: c.lng };
  const ne = map.getBounds().getNorthEast();
  const radius = Math.min(
    distanceMeters(center, { lat: ne.lat, lng: center.lng }),
    distanceMeters(center, { lat: center.lat, lng: ne.lng }),
  );
  return { center, radius: Math.round(radius) };
}

export function RestaurantMap(props: Props) {
  const { home, results, around, area, fitKey, selectedId, insets, onSelect, onMapStop, onViewportChange, children } = props;
  const divRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  // Les restos de la carte (pile et alentours), regroupés quand ils sont serrés.
  const places = useRef<ReturnType<typeof clusteredPlaces> | null>(null);
  // Vrai pendant nos propres recadrages, qui ne doivent pas relancer de recherche.
  const programmatic = useRef(false);

  const callbacks = useRef({ onSelect, onMapStop, onViewportChange });
  useEffect(() => {
    callbacks.current = { onSelect, onMapStop, onViewportChange };
  });

  // Création de la carte.
  useEffect(() => {
    if (!divRef.current) return;
    const m = new maplibregl.Map({
      container: divRef.current,
      style: STYLE,
      center: [home.lng, home.lat],
      zoom: 15,
      // Boutons et crédits en haut à droite : le bas de la carte est caché par la fiche.
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": ACCENT, "fill-opacity": 0.05 } });
      m.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": ACCENT, "line-opacity": 0.5, "line-width": 1.5 } });
      // Les crédits s'ouvrent déplié et cachent le bas de la carte : on les replie derrière leur bouton ⓘ.
      m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      places.current = clusteredPlaces(m, "places", { onSelect: (id) => callbacks.current.onSelect(id) });
      setMap(m);
      callbacks.current.onMapStop(boxOf(m));
    });
    m.on("moveend", () => {
      // Tous les restos de la zone visible, à chaque arrêt (nos recadrages compris) : sans relancer de recherche.
      callbacks.current.onMapStop(boxOf(m));
      if (!programmatic.current) callbacks.current.onViewportChange(viewportCircle(m));
    });
    // Accès pour les tests manuels dans la console (retiré du build de production).
    if (import.meta.env.DEV) (window as unknown as { __groublMap: maplibregl.Map }).__groublMap = m;
    return () => {
      setMap(null);
      m.remove();
    };
    // La carte est créée une fois ; la position suit par les effets ci-dessous.
  }, []);

  // Toi.
  useEffect(() => {
    if (!map) return;
    const { el, marker: m } = marker("home-pin", home);
    el.title = t("you");
    m.addTo(map);
    return () => {
      m.remove();
    };
  }, [map, home]);

  // La zone fouillée.
  useEffect(() => {
    const source = map?.getSource<maplibregl.GeoJSONSource>("area");
    source?.setData(area ? circlePolygon(area) : { type: "FeatureCollection", features: [] });
  }, [map, area]);

  // Les restos de la pile et ceux d'alentour, regroupés quand ils sont serrés ; le resto montré reste toujours
  // seul (jamais dans un groupe), en grosse bulle par-dessus.
  useEffect(() => {
    if (!map) return;
    const inDeck = new Set(results.map((r) => r.id));
    const all = [...results, ...around.filter((r) => !inDeck.has(r.id))];
    places.current?.set(all.filter((r) => r.id !== selectedId));
  }, [map, results, around, selectedId]);

  useEffect(() => {
    const place = results.find((r) => r.id === selectedId);
    if (!map || !place) return;
    const { el, marker: m } = selectedDot(place);
    el.addEventListener("click", () => callbacks.current.onSelect(place.id));
    m.addTo(map);
    return () => {
      m.remove();
    };
  }, [map, results, selectedId]);

  // Recadrage sur toi + le resto de la fiche affichée, quand fitKey change (nouvelle recherche, fiche glissée).
  useEffect(() => {
    if (!map || fitKey === 0) return;
    // Le drapeau reste levé jusqu'à la fin du mouvement : nos recadrages ne relancent pas de recherche.
    programmatic.current = true;
    map.once("moveend", () => (programmatic.current = false));
    const padding = { top: 72, right: 40, bottom: insets.bottom + 32, left: insets.left + 40 };
    const place = results.find((r) => r.id === selectedId);
    if (!place) {
      map.easeTo({ center: [home.lng, home.lat], zoom: 14, padding, duration: 0 });
      return;
    }
    // Le symétrique du resto par rapport à toi : le cadre reste centré sur toi.
    const p = place.location;
    const bounds = new maplibregl.LngLatBounds([p.lng, p.lat], [p.lng, p.lat]).extend([2 * home.lng - p.lng, 2 * home.lat - p.lat]);
    map.fitBounds(bounds, { padding, maxZoom: 17, duration: 600 });
  }, [map, fitKey]);

  return (
    <div className="map-wrap">
      <div ref={divRef} className="map" />
      {children && <div className="map-overlay">{children}</div>}
    </div>
  );
}
