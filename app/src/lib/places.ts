import Constants from "expo-constants";
import { Platform } from "react-native";
import { lang, locale, t } from "../i18n";
import type { Category } from "./osm";

export type LatLng = { latitude: number; longitude: number };

/** Un cercle de recherche. */
export type Area = { center: LatLng; radius: number };

export type Restaurant = {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  type: string;
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
// Limite de searchText.
export const MAX_RADIUS = 50_000;

// Mode rapide : ce qui se mange sur le pouce, d'après les types Google.
const FAST_TYPES = ["fast_food_restaurant", "hamburger_restaurant", "sandwich_shop", "meal_takeaway"];
// En dessous, on n'en veut pas même tout près (écarte surtout les chaînes mal notées).
const FAST_MIN_RATING = 3.8;
// Étoiles perdues par km : à 500 m, il faut 0,4★ de plus que le voisin d'à côté pour passer devant.
const FAST_STARS_PER_KM = 0.8;

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
export const hasApiKey = Boolean(API_KEY && !API_KEY.startsWith("COLLE"));

// Une clé restreinte à l'app iOS n'est acceptée que si la requête dit de quelle app elle vient.
const BUNDLE_ID = Constants.expoConfig?.ios?.bundleIdentifier ?? "";
const googleHeaders: Record<string, string> =
  Platform.OS === "ios" ? { "X-Ios-Bundle-Identifier": BUNDLE_ID } : {};

const PRICE: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "€",
  PRICE_LEVEL_MODERATE: "€€",
  PRICE_LEVEL_EXPENSIVE: "€€€",
  PRICE_LEVEL_VERY_EXPENSIVE: "€€€€",
};

const FIELD_MASK = [
  "id", "displayName", "rating", "userRatingCount", "location", "googleMapsUri",
  "priceLevel", "primaryTypeDisplayName", "businessStatus", "currentOpeningHours.openNow", "types",
].map((f) => `places.${f}`).join(",");

type ApiPlace = {
  id: string;
  displayName?: { text: string };
  rating?: number;
  userRatingCount?: number;
  location?: { latitude: number; longitude: number };
  googleMapsUri?: string;
  priceLevel?: string;
  primaryTypeDisplayName?: { text: string };
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean };
  types?: string[];
};

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

async function placesApi(endpoint: "searchText", body: object): Promise<ApiPlace[]> {
  const res = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY ?? "",
      "X-Goog-FieldMask": FIELD_MASK,
      ...googleHeaders,
    },
    body: JSON.stringify({ ...body, languageCode: lang }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? t("googleError", { status: res.status }));
  return json.places ?? [];
}

/** Le carré qui contient le cercle (searchText n'accepte que des rectangles). */
function circleRectangle({ center, radius }: Area) {
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((center.latitude * Math.PI) / 180));
  return {
    low: { latitude: center.latitude - dLat, longitude: center.longitude - dLng },
    high: { latitude: center.latitude + dLat, longitude: center.longitude + dLng },
  };
}

/** Résultat d'une recherche déjà faite, gardé en mémoire tant que l'app tourne. */
const cache = new Map<string, { at: number; list: Promise<Restaurant[]> }>();

function cached(key: string, search: () => Promise<Restaurant[]>): Promise<Restaurant[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.list;
  const list = search();
  cache.set(key, { at: Date.now(), list });
  // Une erreur ne reste pas en cache : la prochaine demande retente.
  list.catch(() => cache.get(key)?.list === list && cache.delete(key));
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
  const { latitude, longitude } = area.center;
  const key = [latitude.toFixed(4), longitude.toFixed(4), radius, category?.key ?? "", fast].join("|");
  return cached(key, () => fetchRestaurants({ center: area.center, radius }, category, fast));
}

async function fetchRestaurants(area: Area, category: Category | null | undefined, fast: boolean): Promise<Restaurant[]> {
  const places = await placesApi("searchText", {
    // Une cuisine (venue d'OSM) : recherche par mot-clé, comme on le taperait dans Maps.
    textQuery: category ? category.query : fast ? "fast food" : "restaurant",
    // includedType n'accepte qu'un type : en mode rapide, le tri par types se fait dans toRestaurants.
    ...(!category && !fast && { includedType: "restaurant", strictTypeFiltering: true }),
    openNow: true,
    pageSize: 20,
    locationRestriction: { rectangle: circleRectangle(area) },
  });
  return toRestaurants(places, area, fast);
}

function toRestaurants(places: ApiPlace[], area: Area, fast: boolean): Restaurant[] {
  return places
    .filter((p) => p.rating != null && p.location)
    .filter((p) => distanceMeters(area.center, p.location!) <= area.radius)
    // Fermés définitivement / temporairement, ou fermés à cette heure-ci. Horaires inconnus : on garde.
    .filter((p) => (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL" && p.currentOpeningHours?.openNow !== false)
    // Mode rapide : la recherche par mot-clé ramène aussi des restos à table.
    .filter((p) => !fast || p.types?.some((type) => FAST_TYPES.includes(type)))
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text ?? t("noName"),
      rating: p.rating!,
      reviews: p.userRatingCount ?? 0,
      type: p.primaryTypeDisplayName?.text ?? "",
      price: p.priceLevel ? PRICE[p.priceLevel] ?? "" : "",
      url: p.googleMapsUri ?? "",
      location: p.location!,
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

/** Trie par note puis nombre d'avis, en ignorant les restos trop peu notés. */
export function rankTop(list: Restaurant[]): Restaurant[] {
  return list
    .filter((r) => r.reviews >= MIN_REVIEWS)
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
    .filter((r) => r.reviews >= MIN_REVIEWS && r.rating >= FAST_MIN_RATING)
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

// Au-delà, on laisse Google choisir le mode de transport.
const WALKING_MAX = 1500;

export function directionsUrl(home: LatLng, r: Restaurant, distance: number): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${home.latitude},${home.longitude}`,
    destination: r.name,
    destination_place_id: r.id,
  });
  if (distance <= WALKING_MAX) params.set("travelmode", "walking");
  return `https://www.google.com/maps/dir/?${params}`;
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
  const pool = [...list];
  // Mélange de Fisher-Yates.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, TOP_N);
}
