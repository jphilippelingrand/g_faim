import maplibregl from "maplibre-gl";
import "./bubbles.css";
import { locale } from "../i18n";
import type { Box, LatLng, Restaurant } from "../lib/places";

/**
 * Les marqueurs des cartes, tous de la même famille (comme dans l'app) : des bulles en dégradé corail (taupe
 * pour les fermés), cerclées de blanc, dans une lueur douce, avec un petit reflet qui les bombe.
 * - un resto seul : l'anneau, fond transparent (dessiné par MapLibre, il peut y en avoir des centaines) ;
 * - un resto coché dans un vote : une petite bulle pleine avec une coche ;
 * - celui qu'on regarde : une grosse bulle, qui apparaît d'un petit rebond puis respire (un halo qui s'élargit
 *   et s'efface) ;
 * - un groupe : une bulle avec le nombre de restos ; la toucher zoome dessus.
 * Les bulles sont des éléments HTML (styles.css, .bubble) ; les anneaux, des images dessinées une fois.
 */

// Corail (ouvert) ou taupe (fermé).
const HOT = { light: "#ff8a5c", dark: "#e2583e" };
const COLD = { light: "#b3a59a", dark: "#8a7b70" };
type Tone = typeof HOT;

// Deux restos (ou groupes) à moins de ça à l'écran vont dans le même groupe : un peu plus que le plus gros rond.
const CLUSTER_PX = 48;

// Un resto seul : l'anneau de RING px, dans un cadre de RING_FRAME (la place de sa lueur).
const RING = 18;
const RING_FRAME = 30;
// Dessiné en double pour rester net sur les écrans haute densité.
const RATIO = 2;

/** L'anneau en dégradé, liseré de blanc pour se détacher de n'importe quel fond de carte ; la lueur si `glow`. */
function ringImage(tone: Tone, glow: boolean): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = RING_FRAME * RATIO;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(RATIO, RATIO);
  const c = RING_FRAME / 2;
  const r = RING / 2;
  const circle = (x: number, y: number, radius: number) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
  };
  if (glow) {
    const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
    halo.addColorStop(0.45, `${tone.dark}59`);
    halo.addColorStop(1, `${tone.dark}00`);
    ctx.fillStyle = halo;
    circle(c, c, c);
    ctx.fill();
  }
  circle(c, c, r);
  ctx.strokeStyle = "rgb(255 255 255 / .95)";
  ctx.lineWidth = 6;
  ctx.stroke();
  const fill = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
  fill.addColorStop(0, tone.light);
  fill.addColorStop(1, tone.dark);
  ctx.strokeStyle = fill;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  // Le reflet, posé sur l'anneau en haut à gauche.
  circle(c - RING * 0.33, c - RING * 0.33, 1.6);
  ctx.fillStyle = "rgb(255 255 255 / .8)";
  ctx.fill();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Un marqueur dont le contenu est dans un enfant : MapLibre écrit sa position dans le transform de
 * l'élément racine, on garde donc celui de l'enfant pour nos effets (rebond, pulsation).
 */
export function marker(className: string, position: LatLng, text = "") {
  const root = document.createElement("div");
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  root.append(el);
  return { root, el, marker: new maplibregl.Marker({ element: root }).setLngLat(position) };
}

/** Celui qu'on regarde : la grosse bulle (corail, ou taupe si `cold`), son cœur blanc et son halo qui respire. */
export function selectedDot(r: Restaurant, cold = false) {
  const dot = marker(`bubble selected${cold ? " cold" : ""}`, r.location);
  dot.el.title = r.name;
  dot.el.append(Object.assign(document.createElement("span"), { className: "bubble-halo" }));
  // Toujours par-dessus les autres marqueurs.
  dot.root.style.zIndex = "3";
  return dot;
}

/** Coché dans un vote : une petite bulle corail avec une coche blanche. */
export function pickedDot(r: Restaurant) {
  const dot = marker("bubble picked", r.location);
  dot.el.title = r.name;
  dot.el.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M7.5 12.5 10.8 15.8 17 8.8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  dot.root.style.zIndex = "2";
  return dot;
}

/** 1 103 → « 1,1k » (« 1.1k » en anglais) : le nombre tient dans la bulle. */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toLocaleString(locale, { maximumFractionDigits: 1 }) : Math.round(k)}k`;
}

/** Plusieurs restos trop proches à ce zoom : une bulle avec leur nombre, qui grossit (un peu) avec lui. */
function clusterDot(count: number, open: boolean, position: LatLng) {
  const label = compact(count);
  const dot = marker(`bubble cluster${open ? "" : " cold"}${label.length > 3 ? " long" : ""}`, position, label);
  dot.el.style.setProperty("--size", `${Math.round(34 + 6 * Math.log10(count))}px`);
  dot.root.style.zIndex = "1";
  return dot;
}

/** Le rectangle visible de la carte. */
export function boxOf(map: maplibregl.Map): Box {
  const b = map.getBounds();
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
}

type Options = {
  /** Tout en taupe, ouvert ou non (la carte d'un vote, où seuls les cochés sont en couleur). */
  neutral?: boolean;
  onSelect: (id: string) => void;
  /** Un groupe touché (la carte zoome alors dessus). */
  onCluster?: () => void;
};

/**
 * Les restos d'une carte, regroupés par MapLibre quand ils sont trop serrés à l'écran : les anneaux par une
 * couche de la carte, les groupes par des bulles HTML (pour leur nombre, dans la police de la marque), remises
 * à jour à chaque image. À appeler une fois la carte chargée ; `set` change les restos montrés.
 */
export function clusteredPlaces(map: maplibregl.Map, id: string, { neutral = false, onSelect, onCluster }: Options) {
  const images = neutral ? [["dot-neutral", COLD, false]] : [["dot-open", HOT, true], ["dot-closed", COLD, false]];
  for (const [name, tone, glow] of images as [string, Tone, boolean][]) {
    if (!map.hasImage(name)) map.addImage(name, ringImage(tone, glow), { pixelRatio: RATIO });
  }
  map.addSource(id, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterRadius: CLUSTER_PX,
    // On regroupe à tous les zooms (deux restos du même immeuble se chevauchent sinon).
    clusterMaxZoom: 18,
    // Un groupe est corail si au moins un de ses restos est ouvert.
    clusterProperties: { o: ["max", ["get", "o"]] },
  });
  const layer = `${id}-singles`;
  map.addLayer({
    id: layer,
    type: "symbol",
    source: id,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": neutral ? "dot-neutral" : ["case", ["==", ["get", "o"], 1], "dot-open", "dot-closed"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      // Les ouverts par-dessus les fermés.
      "symbol-sort-key": ["get", "o"],
    },
    // Fermé (ou horaires inconnus) : en retrait, pour que les ouverts sautent aux yeux.
    paint: { "icon-opacity": neutral ? 1 : ["case", ["==", ["get", "o"], 1], 1, 0.75] },
  });
  const click = (e: maplibregl.MapLayerMouseEvent) => {
    const placeId = e.features?.[0]?.properties.id;
    if (typeof placeId === "string") onSelect(placeId);
  };
  const pointer = () => (map.getCanvas().style.cursor = "pointer");
  const arrow = () => (map.getCanvas().style.cursor = "");
  map.on("click", layer, click);
  map.on("mouseenter", layer, pointer);
  map.on("mouseleave", layer, arrow);

  // Les bulles des groupes : celles des groupes à l'écran, retrouvées à chaque image (un groupe change de nombre
  // ou de couleur quand les restos changent : il devient une autre bulle).
  const bubbles = new Map<string, maplibregl.Marker>();
  const sync = () => {
    if (!map.getSource(id) || !map.isSourceLoaded(id)) return;
    const seen = new Set<string>();
    for (const f of map.querySourceFeatures(id)) {
      const p = f.properties;
      if (!p.cluster || f.geometry.type !== "Point") continue;
      const [lng, lat] = f.geometry.coordinates;
      const open = !neutral && p.o === 1;
      const key = `${p.cluster_id}:${p.point_count}:${open}:${lng.toFixed(6)},${lat.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (bubbles.has(key)) continue;
      const { el, marker: m } = clusterDot(p.point_count, open, { lat, lng });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onCluster?.();
        map
          .getSource<maplibregl.GeoJSONSource>(id)
          ?.getClusterExpansionZoom(p.cluster_id)
          .then((zoom) => map.easeTo({ center: [lng, lat], zoom, duration: 350 }))
          .catch(console.error);
      });
      bubbles.set(key, m.addTo(map));
    }
    for (const [key, m] of bubbles) {
      if (seen.has(key)) continue;
      m.remove();
      bubbles.delete(key);
    }
  };
  map.on("render", sync);

  return {
    set(places: Restaurant[]) {
      map.getSource<maplibregl.GeoJSONSource>(id)?.setData({
        type: "FeatureCollection",
        features: places.map((r) => ({
          type: "Feature",
          properties: { id: r.id, o: r.open === true ? 1 : 0 },
          geometry: { type: "Point", coordinates: [r.location.lng, r.location.lat] },
        })),
      });
    },
  };
}
