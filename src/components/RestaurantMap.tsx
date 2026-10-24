import { useEffect, useRef, useState } from "react";
import { MAP_ID, importLibrary } from "../lib/google";
import { MAX_RADIUS, distanceMeters, type Area, type LatLng, type Restaurant } from "../lib/places";

const TOP_Z = 100;

type Props = {
  home: LatLng;
  results: Restaurant[];
  area: Area | null;
  /** Incrémenté quand il faut recadrer la carte sur la maison + les résultats. */
  fitKey: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onViewportChange: (view: Area) => void;
};

/** Plus grand cercle centré sur la carte qui tient dans la vue. */
function viewportCircle(map: google.maps.Map): Area | null {
  const bounds = map.getBounds();
  const c = map.getCenter();
  if (!bounds || !c) return null;
  const center = { lat: c.lat(), lng: c.lng() };
  const ne = bounds.getNorthEast();
  const radius = Math.min(
    distanceMeters(center, { lat: ne.lat(), lng: center.lng }),
    distanceMeters(center, { lat: center.lat, lng: ne.lng() }),
  );
  return { center, radius: Math.min(Math.round(radius), MAX_RADIUS) };
}

export function RestaurantMap({ home, results, area, fitKey, selectedId, onSelect, onViewportChange }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const pins = useRef(new Map<string, HTMLElement>());
  // Les idle déclenchés par nos propres fitBounds ne doivent pas relancer de recherche.
  const ignoreIdleUntil = useRef(0);

  const callbacks = useRef({ onSelect, onViewportChange });
  useEffect(() => {
    callbacks.current = { onSelect, onViewportChange };
  });

  // Création de la carte.
  useEffect(() => {
    if (map || !divRef.current) return;
    let cancelled = false;
    (async () => {
      const { Map: GoogleMap } = await importLibrary<google.maps.MapsLibrary>("maps");
      await importLibrary<google.maps.MarkerLibrary>("marker");
      if (cancelled || !divRef.current) return;
      const m = new GoogleMap(divRef.current, {
        center: home,
        zoom: 17,
        mapId: MAP_ID,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: "greedy",
      });
      m.addListener("idle", () => {
        if (performance.now() < ignoreIdleUntil.current) return;
        const view = viewportCircle(m);
        if (view) callbacks.current.onViewportChange(view);
      });
      setMap(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [map, home]);

  // Toi.
  useEffect(() => {
    if (!map) return;
    const el = document.createElement("div");
    el.className = "home-pin";
    const marker = new google.maps.marker.AdvancedMarkerElement({ map, position: home, content: el, title: "Toi" });
    return () => {
      marker.map = null;
    };
  }, [map, home]);

  // La zone fouillée.
  useEffect(() => {
    if (!map || !area) return;
    const circle = new google.maps.Circle({
      map,
      center: area.center,
      radius: area.radius,
      strokeColor: "#e2583e",
      strokeOpacity: 0.5,
      strokeWeight: 1.5,
      fillColor: "#e2583e",
      fillOpacity: 0.05,
      clickable: false,
    });
    return () => circle.setMap(null);
  }, [map, area]);

  // Les restos.
  useEffect(() => {
    if (!map) return;
    const markers = results.map((r, i) => {
      const el = document.createElement("div");
      el.className = "pin";
      el.textContent = String(i + 1);
      pins.current.set(r.id, el);
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: r.location,
        content: el,
        title: r.name,
        zIndex: TOP_Z - i,
      });
      marker.addEventListener("gmp-click", () => callbacks.current.onSelect(r.id));
      return marker;
    });
    return () => {
      markers.forEach((m) => (m.map = null));
      pins.current.clear();
    };
  }, [map, results]);

  useEffect(() => {
    pins.current.forEach((el, id) => el.classList.toggle("selected", id === selectedId));
  }, [selectedId, results]);

  // Recadrage : seulement quand fitKey change (recherche initiale), pas après un dézoom.
  useEffect(() => {
    if (!map || fitKey === 0) return;
    ignoreIdleUntil.current = performance.now() + 1500;
    if (!results.length) {
      map.setCenter(home);
      map.setZoom(15);
      return;
    }
    // On ajoute aussi le symétrique de chaque resto par rapport à la maison,
    // pour que le cadre soit centré sur toi et pas sur le milieu des résultats.
    const bounds = new google.maps.LatLngBounds(home);
    results.forEach(({ location: p }) => {
      bounds.extend(p);
      bounds.extend({ lat: 2 * home.lat - p.lat, lng: 2 * home.lng - p.lng });
    });
    map.fitBounds(bounds, 48);
  }, [map, fitKey]);

  return <div ref={divRef} className="map" />;
}
