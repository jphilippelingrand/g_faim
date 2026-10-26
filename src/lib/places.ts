import { importLibrary } from "./google";
import type { Category } from "./osm";
import { locale, t } from "../i18n";

export type LatLng = { lat: number; lng: number };

/** Un cercle de recherche. */
export type Area = { center: LatLng; radius: number };

export type Restaurant = {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  type: string;
  /** Ouvert en ce moment ; undefined si Google ne connaît pas les horaires. */
  open?: boolean;
  price: string;
  url: string;
  location: LatLng;
};

export const TOP_N = 5;
// Écarte les 5,0★ à 3 avis qui squatteraient le podium.
const MIN_REVIEWS = 10;
const START_RADIUS = 500;
// Chaque étape quadruple le rayon : 500 m, 2 km, 8 km au pire (une recherche par étape).
const RADIUS_STEP = 4;
// Au démarrage, on n'élargit pas au-delà ; dézoomer permet d'aller plus loin.
const MAX_START_RADIUS = 8000;
// Chaque recherche est facturée : on réutilise un résultat 10 min (le statut d'ouverture finit par changer).
const CACHE_TTL = 10 * 60_000;
const CACHE_PREFIX = "jaifaim:places:";
// Limite de searchText.
export const MAX_RADIUS = 50_000;

// Mode rapide : ce qui se mange sur le pouce, d'après les types Google.
const FAST_TYPES = ["fast_food_restaurant", "hamburger_restaurant", "sandwich_shop", "meal_takeaway"];
// En dessous, on n'en veut pas même tout près (écarte surtout les chaînes mal notées).
const FAST_MIN_RATING = 3.8;
// Étoiles perdues par km : à 500 m, il faut 0,4★ de plus que le voisin d'à côté pour passer devant.
const FAST_STARS_PER_KM = 0.8;

const PRICE: Record<string, string> = {
  INEXPENSIVE: "€",
  MODERATE: "€€",
  EXPENSIVE: "€€€",
  VERY_EXPENSIVE: "€€€€",
};

export function getBrowserPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(t("noGeolocation")));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error(t("geolocationDenied"))),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export async function geocode(address: string): Promise<LatLng> {
  const { Geocoder } = await importLibrary<google.maps.GeocodingLibrary>("geocoding");
  const { results } = await new Geocoder().geocode({ address });
  if (!results.length) throw new Error(t("addressNotFound"));
  const loc = results[0].geometry.location;
  return { lat: loc.lat(), lng: loc.lng() };
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const WEEK_MINUTES = 7 * 24 * 60;

/**
 * Ouvert en ce moment, d'après les horaires du jour (exceptions comprises) et le fuseau du resto.
 * undefined si Google ne connaît pas les horaires. (Place.isOpen() existe, mais seulement en bêta.)
 */
function isOpenNow(place: google.maps.places.Place, now = new Date()): boolean | undefined {
  const hours = place.currentOpeningHours ?? place.regularOpeningHours;
  if (!hours?.periods.length || place.utcOffsetMinutes == null) return undefined;

  // Minute de la semaine à l'heure locale du resto, 0 = dimanche 00:00 comme dans l'API.
  const local = new Date(now.getTime() + place.utcOffsetMinutes * 60_000);
  const t = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();

  return hours.periods.some(({ open, close }) => {
    if (!close) return true; // 24h/24
    const start = open.day * 1440 + open.hour * 60 + open.minute;
    let end = close.day * 1440 + close.hour * 60 + close.minute;
    if (end <= start) end += WEEK_MINUTES; // passe minuit dans la nuit de samedi à dimanche
    return (t >= start && t < end) || (t + WEEK_MINUTES >= start && t + WEEK_MINUTES < end);
  });
}

const FIELDS = [
  "id", "displayName", "rating", "userRatingCount", "location",
  "googleMapsURI", "priceLevel", "primaryTypeDisplayName",
  "businessStatus", "currentOpeningHours", "regularOpeningHours", "utcOffsetMinutes", "types",
];

/** Le carré qui contient le cercle (searchByText n'accepte que des rectangles). */
function circleBounds({ center, radius }: Area): google.maps.LatLngBoundsLiteral {
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return { north: center.lat + dLat, south: center.lat - dLat, east: center.lng + dLng, west: center.lng - dLng };
}

/** Résultat d'une recherche déjà faite : en mémoire, sinon dans sessionStorage (survit à un rechargement). */
const memoryCache = new Map<string, { at: number; list: Promise<Restaurant[]> }>();

function cached(key: string, search: () => Promise<Restaurant[]>): Promise<Restaurant[]> {
  const hit = memoryCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.list;
  try {
    const saved = JSON.parse(sessionStorage.getItem(CACHE_PREFIX + key) ?? "null") as { at: number; list: Restaurant[] } | null;
    if (saved && Date.now() - saved.at < CACHE_TTL) {
      memoryCache.set(key, { at: saved.at, list: Promise.resolve(saved.list) });
      return Promise.resolve(saved.list);
    }
  } catch {
    // sessionStorage indisponible (navigation privée…) : on se contente de la mémoire.
  }
  const at = Date.now();
  const list = search();
  memoryCache.set(key, { at, list });
  list.then(
    (value) => {
      try {
        sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at, list: value }));
      } catch {
        // Plein ou indisponible : tant pis.
      }
    },
    () => memoryCache.get(key)?.list === list && memoryCache.delete(key),
  );
  return list;
}

/**
 * Restos notés et ouverts en ce moment dans le cercle, en une seule recherche (chacune est facturée) :
 * searchText filtré par Google sur « ouvert maintenant », qui en trouve 20 même à 1 h du matin
 * (searchNearby ne sait pas filtrer sur l'ouverture). Elle ne trie pas par note : le classement se fait dans rankTop.
 * En mode rapide, on cherche « fast food » et on garde ce que Google classe dans les types « sur le pouce ».
 */
export function searchRestaurants(area: Area, category?: Category | null, fast = false): Promise<Restaurant[]> {
  const radius = Math.round(Math.min(area.radius, MAX_RADIUS));
  // Arrondi à ~10 m : rouvrir une cuisine ou un mode déjà vus depuis la même position ne coûte rien.
  const key = [area.center.lat.toFixed(4), area.center.lng.toFixed(4), radius, category?.key ?? "", fast].join("|");
  return cached(key, () => fetchRestaurants({ center: area.center, radius }, category, fast));
}

async function fetchRestaurants(area: Area, category: Category | null | undefined, fast: boolean): Promise<Restaurant[]> {
  const { Place } = await importLibrary<google.maps.PlacesLibrary>("places");
  const { places } = await Place.searchByText({
    fields: FIELDS,
    // Une cuisine (venue d'OSM) : recherche par mot-clé, comme on le taperait dans Maps.
    textQuery: category ? category.query : fast ? "fast food" : "restaurant",
    // includedType n'accepte qu'un type : en mode rapide, le tri par types se fait dans toRestaurants.
    ...(!category && !fast && { includedType: "restaurant", useStrictTypeFiltering: true }),
    isOpenNow: true,
    locationRestriction: circleBounds(area),
    maxResultCount: 20,
  });
  return toRestaurants(places, area, fast);
}

function toRestaurants(
  places: google.maps.places.Place[],
  area: Area,
  fast: boolean,
): Restaurant[] {
  return places
    .filter((p) => p.rating != null && p.location)
    .filter((p) => distanceMeters(area.center, { lat: p.location!.lat(), lng: p.location!.lng() }) <= area.radius)
    // Fermés définitivement ou temporairement (« ouvert maintenant » ne suffit pas toujours à les écarter).
    .filter((p) => (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL")
    // Mode rapide : la recherche par mot-clé ramène aussi des restos à table.
    .filter((p) => !fast || p.types?.some((type) => FAST_TYPES.includes(type)))
    .map((p) => ({
      id: p.id,
      name: p.displayName ?? t("noName"),
      rating: p.rating!,
      reviews: p.userRatingCount ?? 0,
      type: p.primaryTypeDisplayName ?? "",
      open: isOpenNow(p),
      price: p.priceLevel ? PRICE[p.priceLevel] ?? "" : "",
      url: p.googleMapsURI ?? "",
      location: { lat: p.location!.lat(), lng: p.location!.lng() },
    }));
}

/** Élargit le rayon à partir de 500 m jusqu'à avoir TOP_N restos classables (ou atteindre MAX_START_RADIUS). */
export async function searchUntilTop(
  center: LatLng,
  category?: Category | null,
  fast = false,
): Promise<{ list: Restaurant[]; area: Area }> {
  for (let radius = START_RADIUS; ; radius *= RADIUS_STEP) {
    const area = { center, radius };
    const list = await searchRestaurants(area, category, fast);
    const ranked = fast ? rankFast(list, center) : rankTop(list);
    if (ranked.length >= TOP_N || radius >= MAX_START_RADIUS) return { list, area };
  }
}

const hasEnoughReviews = (r: Restaurant) => r.reviews >= MIN_REVIEWS;

/** Trie par note puis nombre d'avis, en ignorant les restos fermés (horaires inconnus : gardés) ou trop peu notés. */
export function rankTop(list: Restaurant[]): Restaurant[] {
  return list
    .filter((r) => r.open !== false && hasEnoughReviews(r))
    .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
    .slice(0, TOP_N);
}

/**
 * Mode rapide : la note moins une pénalité de distance (quand on veut manger vite, la porte d'à côté
 * compte), une seule adresse par enseigne, et rien sous FAST_MIN_RATING.
 */
export function rankFast(list: Restaurant[], origin: LatLng): Restaurant[] {
  const score = (r: Restaurant) => r.rating - (distanceMeters(origin, r.location) / 1000) * FAST_STARS_PER_KM;
  const seen = new Set<string>();
  return list
    .filter((r) => r.open !== false && hasEnoughReviews(r) && r.rating >= FAST_MIN_RATING)
    .sort((a, b) => score(b) - score(a))
    .filter((r) => {
      const brand = r.name.toLowerCase();
      if (seen.has(brand)) return false;
      seen.add(brand);
      return true;
    })
    .slice(0, TOP_N);
}

export function formatDistance(m: number): string {
  return m >= 1000
    ? `${(m / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`
    : `${Math.round(m)} m`;
}


/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine → même tirage. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mode surprise : TOP_N restos ouverts tirés au sort, bien notés ou pas, même avec peu d'avis.
 * La graine fige le tirage tant qu'on ne demande pas « Autre tirage ».
 */
export function pickRandom(list: Restaurant[], seed: number): Restaurant[] {
  const random = seededRandom(seed);
  const pool = list.filter((r) => r.open !== false);
  // Mélange de Fisher-Yates.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, TOP_N);
}
