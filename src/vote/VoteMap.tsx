import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PollPlace } from "../lib/polls";
import { marker, selectedDot } from "../components/mapDots";
import { STYLE } from "../components/RestaurantMap";

type Props = {
  places: PollPlace[];
  /** Le resto mis en avant (survolé ou touché, sinon l'élu) : la grosse bulle. */
  selected: number | null;
  /** Les numéros sur les bulles (le classement), dans l'ordre de `places` ; sans : de simples bulles. */
  labels?: string[];
  onSelect?: (index: number) => void;
};

// Autour des restos cadrés : jamais plus serré qu'un pâté de maisons.
const MIN_DELTA = 0.0012;

const at = (p: PollPlace) => ({ lat: p.lat, lng: p.lng });

/**
 * La carte de la page de vote : les restos proposés, cadrés tous ensemble, celui qu'on regarde en grosse
 * bulle. Les bulles portent le rang de chaque resto dès le premier vote.
 */
export function VoteMap({ places, selected, labels, onSelect }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const callbacks = useRef({ onSelect });
  useEffect(() => {
    callbacks.current = { onSelect };
  });

  useEffect(() => {
    if (!divRef.current) return;
    const lats = places.map((p) => p.lat);
    const lngs = places.map((p) => p.lng);
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const dLat = Math.max(maxLat - minLat, MIN_DELTA) / 2;
    const dLng = Math.max(maxLng - minLng, MIN_DELTA) / 2;
    const [lat, lng] = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
    const m = new maplibregl.Map({
      container: divRef.current,
      style: STYLE,
      bounds: [lng - dLng, lat - dLat, lng + dLng, lat + dLat],
      fitBoundsOptions: { padding: 40, maxZoom: 18 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      // Sur téléphone, un doigt fait défiler la page ; deux déplacent la carte.
      cooperativeGestures: matchMedia("(pointer: coarse)").matches,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.on("load", () => {
      m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      setMap(m);
    });
    return () => {
      setMap(null);
      m.remove();
    };
    // Les restos d'un vote ne changent pas : la carte est créée une fois.
  }, []);

  const labelsKey = labels?.join() ?? "";
  useEffect(() => {
    if (!map) return;
    const dots = places.map((p, i) => {
      const dot =
        i === selected
          ? selectedDot({ id: String(i), name: p.name, location: at(p) })
          : marker(labels ? "bubble cluster" : "bubble", at(p), labels?.[i] ?? "");
      dot.el.title = p.name;
      dot.el.addEventListener("click", () => callbacks.current.onSelect?.(i));
      return dot.marker.addTo(map);
    });
    return () => {
      dots.forEach((d) => d.remove());
    };
  }, [map, selected, labelsKey]);

  return <div ref={divRef} className="vote-map" />;
}
