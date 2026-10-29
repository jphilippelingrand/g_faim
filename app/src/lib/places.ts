import { locale, lang, t } from "../i18n";
import { leafFor, LEVELS, WEEK_MINUTES, type PlaceRow, type PlacesIndex } from "./placesGrid";

export type LatLng = { latitude: number; longitude: number };

/** Un cercle de recherche. */
export type Area = { center: LatLng; radius: number };

export type Restaurant = {
  id: string;
  name: string;
  /** Clé OSM de cuisine=* (ex. "pizza"), si renseignée. */
  cuisine?: string;
  /** Encore ouvert quand on arrive et qu'on a mangé (d'après ses horaires) ; undefined si on ne les connaît pas. */
  open?: boolean;
  /** Minutes avant la fermeture ; Infinity si ouvert 24 h/24. */
  closesIn?: number;
  location: LatLng;
};

export const TOP_N = 5;
// On élargit jusqu'à trouver TOP_N restos ouverts : 500 m, 1 km, 2 km… 32 km au pire.
const RADII = [500, 1000, 2000, 4000, 8000, 16_000, 32_000];
const MAX_RADIUS = RADII[RADII.length - 1];
// À partir de ce rayon, plutôt que d'aller plus loin, on complète avec les restos proches aux horaires inconnus.
const FILL_UNKNOWN_FROM = 2000;
// « Encore ouvert quand t'arrives » : le trajet, plus le temps de manger. Un resto qui ferme avant ne compte pas comme ouvert.
const EAT_MINUTES = 20;

// Les mêmes fichiers que le site, servis par le CDN de Vercel : un nouveau calcul ne demande pas de mise à jour de l'app.
const PLACES_URL = "https://www.groubl.com/places";

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Minutes avant la fermeture, à l'heure de l'iPhone (le resto est à côté, donc dans le même fuseau) ;
 * 0 si fermé, Infinity si ouvert 24 h/24, undefined si horaires inconnus. Les intervalles qui se suivent
 * (ouvert après minuit, ou du dimanche au lundi) sont enchaînés.
 */
function minutesUntilClose(hours: number[] | 0, now: Date): number | undefined {
  if (!hours) return undefined;
  const current = ((now.getDay() + 6) % 7) * 1440 + now.getHours() * 60 + now.getMinutes();
  const intervals: [number, number][] = [];
  for (let i = 0; i < hours.length; i += 2) intervals.push([hours[i], hours[i + 1]]);
  let at = current;
  let open = 0;
  // Une semaine au plus : au-delà, c'est ouvert en continu.
  while (open < WEEK_MINUTES) {
    const slot = intervals.find(([start, end]) => start <= at && at < end);
    if (!slot) return open;
    open += slot[1] - at;
    at = slot[1] % WEEK_MINUTES;
  }
  return Infinity;
}

let indexPromise: Promise<{ version: string; split: Set<string> }> | null = null;

/** Liste des carrés découpés (et version des fichiers), chargée une fois par lancement. */
function getIndex() {
  indexPromise ??= fetch(`${PLACES_URL}/index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(t("oops"));
      return r.json() as Promise<PlacesIndex>;
    })
    .then(({ version, split }) => ({ version, split: new Set(split) }));
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

const files = new Map<string, Promise<PlaceRow[]>>();

/** Un fichier de restos ; vide hors des pays couverts. */
function getFile(level: number, key: string, version: string): Promise<PlaceRow[]> {
  const path = `${level}/${key}`;
  let file = files.get(path);
  if (!file) {
    file = fetch(`${PLACES_URL}/${path}.json?v=${version}`).then((r) =>
      // Zone non couverte : 404 (on vérifie aussi le type, au cas où le site renverrait une page).
      r.ok && r.headers.get("content-type")?.includes("json") ? (r.json() as Promise<PlaceRow[]>) : [],
    );
    file.catch(() => files.delete(path));
    files.set(path, file);
  }
  return file;
}

/** Tous les restos des fichiers qui touchent le carré autour du cercle (un point tous les 0,05°, pour n'en rater aucun). */
async function restaurantsAround({ center, radius }: Area): Promise<Restaurant[]> {
  const { version, split } = await getIndex();
  const step = LEVELS[LEVELS.length - 1];
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((center.latitude * Math.PI) / 180));
  const leaves = new Map<string, { level: number; key: string }>();
  for (let lat = center.latitude - dLat; lat < center.latitude + dLat + step; lat += step) {
    for (let lng = center.longitude - dLng; lng < center.longitude + dLng + step; lng += step) {
      const leaf = leafFor(split, Math.min(lat, center.latitude + dLat), Math.min(lng, center.longitude + dLng));
      leaves.set(`${leaf.level}/${leaf.key}`, leaf);
    }
  }
  const now = new Date();
  const rows = (await Promise.all([...leaves.values()].map(({ level, key }) => getFile(level, key, version)))).flat();
  return rows.map(([name, latitude, longitude, hours, cuisine]) => {
    const closesIn = minutesUntilClose(hours, now);
    return {
      id: `${latitude},${longitude},${name}`,
      name,
      cuisine: cuisine || undefined,
      closesIn,
      location: { latitude, longitude },
    };
  });
}

// Un même resto est parfois saisi deux fois dans OSM (un point et le contour du bâtiment).
const DUPLICATE_DISTANCE = 100;

/** Garde le premier de chaque nom à moins de DUPLICATE_DISTANCE d'un homonyme déjà gardé. */
function withoutDuplicates(list: Restaurant[]): Restaurant[] {
  const kept: Restaurant[] = [];
  for (const r of list) {
    const name = r.name.toLowerCase();
    if (!kept.some((k) => k.name.toLowerCase() === name && distanceMeters(k.location, r.location) < DUPLICATE_DISTANCE)) kept.push(r);
  }
  return kept;
}

/** Encore ouvert à l'arrivée, avec le temps de manger ; undefined si horaires inconnus. */
function openOnArrival(r: Restaurant, meters: number): boolean | undefined {
  if (r.closesIn === undefined) return undefined;
  return r.closesIn >= travelTime(meters).minutes + EAT_MINUTES;
}

const byDistance = (center: LatLng) => (a: Restaurant, b: Restaurant) =>
  distanceMeters(center, a.location) - distanceMeters(center, b.location);

/**
 * Les TOP_N restos ouverts les plus proches, en élargissant le rayon jusqu'à les trouver. Passé
 * FILL_UNKNOWN_FROM, on complète avec les plus proches aux horaires inconnus plutôt que d'aller plus loin.
 * Les restos sûrement ouverts passent toujours devant.
 */
export function nearestOpen(center: LatLng): Promise<{ list: Restaurant[]; area: Area }> {
  return nearestWithin(center, RADII);
}

/** Pareil, mais dans le cercle visible de la carte seulement (plafonné : au-delà, trop de fichiers à charger). */
export function nearestOpenInView(view: Area): Promise<{ list: Restaurant[]; area: Area }> {
  return nearestWithin(view.center, [Math.min(view.radius, MAX_RADIUS)]);
}

async function nearestWithin(center: LatLng, radii: number[]): Promise<{ list: Restaurant[]; area: Area }> {
  let area: Area = { center, radius: radii[0] };
  let list: Restaurant[] = [];
  for (const radius of radii) {
    area = { center, radius };
    const inside = (await restaurantsAround(area))
      .filter((r) => distanceMeters(center, r.location) <= radius)
      .sort(byDistance(center))
      .map((r) => ({ ...r, open: openOnArrival(r, distanceMeters(center, r.location)) }));
    const open = withoutDuplicates(inside.filter((r) => r.open === true));
    list = open.slice(0, TOP_N);
    if (list.length < TOP_N && radius >= FILL_UNKNOWN_FROM) {
      list = withoutDuplicates([...list, ...inside.filter((r) => r.open === undefined)]).slice(0, TOP_N);
    }
    if (list.length >= TOP_N) break;
  }
  return { list, area };
}

// Grosso modo : 4,8 km/h à pied, en voiture 24 km/h en ville plus 3 min pour se garer ; les rues font
// des détours, d'où un trajet 30 à 40 % plus long que la ligne droite.
const WALK_METERS_PER_MIN = 80;
const DRIVE_METERS_PER_MIN = 400;
const PARKING_MIN = 3;
// Au-delà, on donne le temps en voiture.
const MAX_WALK_MIN = 30;

/** Temps de trajet estimé depuis la distance à vol d'oiseau : à pied si c'est raisonnable, sinon en voiture. */
export function travelTime(meters: number): { mode: "walk" | "drive"; minutes: number } {
  const walk = Math.max(1, Math.round((meters * 1.3) / WALK_METERS_PER_MIN));
  if (walk <= MAX_WALK_MIN) return { mode: "walk", minutes: walk };
  return { mode: "drive", minutes: Math.round((meters * 1.4) / DRIVE_METERS_PER_MIN) + PARKING_MIN };
}

export function formatDistance(m: number): string {
  return m >= 1000
    ? `${(m / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`
    : `${Math.round(m)} m`;
}

/** Heure de fermeture lisible (« 22 h 30 », « 10:30 PM »…). */
export function formatClosingTime(closesIn: number, now = new Date()): string {
  const at = new Date(now.getTime() + closesIn * 60_000);
  if (at.getHours() === 0 && at.getMinutes() === 0) return t("midnight");
  if (lang === "fr") {
    const minutes = at.getMinutes();
    return `${at.getHours()} h${minutes ? ` ${String(minutes).padStart(2, "0")}` : ""}`;
  }
  return at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/** Itinéraire dans Plans (Apple), à pied ou en voiture selon la distance : une simple URL, gratuite. */
export function directionsUrl(r: Restaurant, walking: boolean): string {
  const params = new URLSearchParams({
    daddr: `${r.location.latitude},${r.location.longitude}`,
    q: r.name,
    dirflg: walking ? "w" : "d",
  });
  return `https://maps.apple.com/?${params}`;
}

/** Lien à envoyer aux copains : le resto dans Plans, sans notre position de départ. */
export function shareUrl(r: Restaurant): string {
  const params = new URLSearchParams({ q: r.name, ll: `${r.location.latitude},${r.location.longitude}` });
  return `https://maps.apple.com/?${params}`;
}
