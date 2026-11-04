import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { distanceMeters, type Box, type LatLng, type Restaurant } from "../lib/places";
import { t } from "../i18n";
import { boxOf, clusteredPlaces, marker, pickedDot, selectedDot } from "./mapDots";
import { STYLE } from "./RestaurantMap";

type Props = {
  home: LatLng;
  /** Les restos proposés (ceux de la liste) : en taupe, regroupés quand ils sont serrés. */
  places: Restaurant[];
  /** Les restos cochés : en corail, même s'ils ne sont plus dans la liste. */
  picked: Restaurant[];
  /** Le resto survolé ou touché dans la liste (ou sur la carte) : plus gros ; avec `fly`, la carte va dessus. */
  focus: { id: string; fly: boolean } | null;
  onSelect: (id: string) => void;
  /** La carte s'est arrêtée (cadrage, ou déplacée à la main) : la zone visible, pour y charger les restos. */
  onView: (box: Box) => void;
  /** Des restos à cadrer dès qu'ils changent (les résultats d'une recherche par nom), sans toi. */
  frame?: Restaurant[];
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

/** Le rectangle qui montre tous ces points, avec sa marge. */
function boundsAround(points: LatLng[]): maplibregl.LngLatBounds {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const dLat = Math.max((maxLat - minLat) * MARGIN, MIN_DELTA) / 2;
  const dLng = Math.max((maxLng - minLng) * MARGIN, MIN_DELTA) / 2;
  const [lat, lng] = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
  return new maplibregl.LngLatBounds([lng - dLng, lat - dLat], [lng + dLng, lat + dLat]);
}

/**
 * La carte de la fenêtre « On mange où ? », comme celle de l'app : tous les restos proposés en taupe (ouverts
 * ou non, c'est la liste qui le dit), les cochés en corail. Elle s'ouvre sur toi et les restos d'à côté ; un
 * resto touché dans la liste, elle va dessus ; la sélection change, elle cadre tous les cochés (sans toi).
 * Chaque fois qu'elle s'arrête, elle donne sa zone visible (onView) : on y charge tous les restos.
 */
export function PollMap({ home, places, picked, focus, onSelect, onView, frame }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const layer = useRef<ReturnType<typeof clusteredPlaces> | null>(null);
  // Tant qu'on n'a touché à rien (carte, ligne, case), le cadrage d'ouverture suit la liste : celle de la carte
  // principale d'abord, puis les restos d'à côté (fermés compris), souvent plus proches.
  const touched = useRef(false);
  const pickedIds = picked.map((r) => r.id);
  const focused = focus?.id ?? null;

  const callbacks = useRef({ onSelect, onView });
  useEffect(() => {
    callbacks.current = { onSelect, onView };
  });

  // Création de la carte.
  useEffect(() => {
    if (!divRef.current) return;
    const m = new maplibregl.Map({
      container: divRef.current,
      style: STYLE,
      center: [home.lng, home.lat],
      zoom: 15,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    let ready = false;
    m.on("load", () => {
      ready = true;
      m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      layer.current = clusteredPlaces(m, "poll", {
        neutral: true,
        onSelect: (id) => callbacks.current.onSelect(id),
        onCluster: () => (touched.current = true),
      });
      setMap(m);
      callbacks.current.onView(boxOf(m));
    });
    // Seul un déplacement à la main (pas nos cadrages) arrête le cadrage d'ouverture.
    m.on("movestart", (e) => {
      if (e.originalEvent) touched.current = true;
    });
    m.on("moveend", () => ready && callbacks.current.onView(boxOf(m)));
    return () => {
      setMap(null);
      m.remove();
    };
    // La carte est créée une fois.
  }, []);

  /** Cadre ces points ; avec `withHome`, toi aussi. */
  const fit = (points: LatLng[], withHome = true) => {
    if (!map || !points.length) return;
    map.fitBounds(boundsAround(withHome ? [home, ...points] : points), { padding: 8, maxZoom: 17, duration: 350 });
  };

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

  // Cadrage d'ouverture, dès que la carte est prête et à chaque nouvelle liste : toi et les plus proches.
  const placesKey = places.slice(0, FIRST_FRAME).map((r) => r.id).join();
  useEffect(() => {
    if (!map || touched.current) return;
    const near = picked.filter((r) => distanceMeters(home, r.location) <= NEAR_PICKED);
    fit((places.length ? [...places.slice(0, FIRST_FRAME), ...near] : picked).map((r) => r.location));
  }, [map, placesKey]);

  // Un resto touché dans la liste : la carte va dessus, sans le cocher. (Survolé : il grossit seulement, sinon
  // la carte bougerait, et la liste avec elle, sous la souris.)
  useEffect(() => {
    const spot = [...picked, ...places].find((r) => r.id === focused);
    if (!map || !spot || !focus?.fly) return;
    touched.current = true;
    const { lat, lng } = spot.location;
    const d = FOCUS_DELTA / 2;
    map.fitBounds([lng - d, lat - d, lng + d, lat + d], { duration: 350 });
  }, [map, focus]);

  // La sélection change (coché, décoché) : on cadre les cochés seulement (sans toi : on vote souvent pour un
  // resto ailleurs). Un seul coché : la carte va dessus.
  const pickedKey = pickedIds.join();
  const firstPicked = useRef(pickedKey);
  useEffect(() => {
    if (!map || pickedKey === firstPicked.current) return;
    firstPicked.current = pickedKey;
    touched.current = true;
    fit(picked.map((r) => r.location), false);
  }, [map, pickedKey]);

  // Une recherche par nom a trouvé des restos : on les cadre (sans toi : ils sont peut-être à l'autre bout de la ville).
  const frameKey = frame?.map((r) => r.id).join() ?? "";
  useEffect(() => {
    if (!map || !frame?.length) return;
    touched.current = true;
    fit(frame.map((r) => r.location), false);
  }, [map, frameKey]);

  // Les restos proposés, regroupés quand ils sont serrés (les cochés et celui qu'on regarde restent toujours seuls).
  useEffect(() => {
    if (!map) return;
    layer.current?.set(places.filter((r) => !pickedIds.includes(r.id) && r.id !== focused));
  }, [map, places, pickedKey, focused]);

  // Les cochés (petites bulles corail) et celui qu'on regarde (grosse bulle, taupe s'il n'est pas coché).
  useEffect(() => {
    if (!map) return;
    const spot = places.find((r) => r.id === focused && !pickedIds.includes(r.id));
    const dots = [...picked, ...(spot ? [spot] : [])].map((r) => {
      const { el, marker: m } = r.id === focused ? selectedDot(r, r === spot) : pickedDot(r);
      el.addEventListener("click", () => callbacks.current.onSelect(r.id));
      return m.addTo(map);
    });
    return () => {
      dots.forEach((m) => m.remove());
    };
  }, [map, pickedKey, places, focused]);

  return <div ref={divRef} className="poll-map" />;
}
