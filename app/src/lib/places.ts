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
  photo?: string;
  location: LatLng;
};

export const TOP_N = 5;
// Écarte les 5,0★ à 3 avis qui squatteraient le podium.
const MIN_REVIEWS = 10;
const START_RADIUS = 200;
// Au démarrage, on n'élargit pas au-delà (pire cas : 6 étapes) ; dézoomer permet d'aller plus loin.
const MAX_START_RADIUS = 6400;
// Limite de searchNearby.
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
export const googleHeaders: Record<string, string> =
  Platform.OS === "ios" ? { "X-Ios-Bundle-Identifier": BUNDLE_ID } : {};

const PRICE: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "€",
  PRICE_LEVEL_MODERATE: "€€",
  PRICE_LEVEL_EXPENSIVE: "€€€",
  PRICE_LEVEL_VERY_EXPENSIVE: "€€€€",
};

const FIELD_MASK = [
  "id", "displayName", "rating", "userRatingCount", "location", "googleMapsUri",
  "priceLevel", "primaryTypeDisplayName", "photos", "businessStatus", "currentOpeningHours.openNow", "types",
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
  photos?: { name: string }[];
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

function photoUrl(name: string): string {
  return `https://places.googleapis.com/v1/${name}/media?maxWidthPx=200&maxHeightPx=200&key=${API_KEY}`;
}

async function placesApi(endpoint: "searchNearby" | "searchText", body: object): Promise<ApiPlace[]> {
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

/**
 * Restos notés et ouverts en ce moment dans le cercle. Deux recherches en parallèle, fusionnées :
 * - searchNearby : les 20 plus populaires, mais ouverts ou non (la nuit, souvent presque tous fermés) ;
 * - searchText filtré par Google sur « ouvert maintenant » : 20 restos ouverts, même à 1 h du matin.
 * Aucune ne trie par note : le classement se fait dans rankTop.
 * En mode rapide, les mêmes recherches portent sur les types « sur le pouce » au lieu de « restaurant ».
 */
export async function searchRestaurants(area: Area, category?: Category | null, fast = false): Promise<Restaurant[]> {
  const radius = Math.min(area.radius, MAX_RADIUS);
  const rectangle = circleRectangle({ center: area.center, radius });

  const responses = await Promise.allSettled(
    category
      ? // Une cuisine (venue d'OSM) : recherche Google par mot-clé, comme on le taperait dans Maps.
        [true, false].map((openNow) =>
          placesApi("searchText", { textQuery: category.query, openNow, pageSize: 20, locationRestriction: { rectangle } }),
        )
      : [
          placesApi("searchNearby", {
            includedPrimaryTypes: fast ? FAST_TYPES : ["restaurant"],
            maxResultCount: 20,
            rankPreference: "POPULARITY",
            locationRestriction: { circle: { center: area.center, radius } },
          }),
          placesApi("searchText", {
            // includedType n'accepte qu'un type : on prend le plus courant, les autres viennent de searchNearby.
            textQuery: fast ? "fast food" : "restaurant",
            includedType: fast ? "fast_food_restaurant" : "restaurant",
            strictTypeFiltering: true,
            openNow: true,
            pageSize: 20,
            locationRestriction: { rectangle },
          }),
        ],
  );
  const ok = responses.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) throw (responses[0] as PromiseRejectedResult).reason;
  const places = [...new Map(ok.flat().map((p) => [p.id, p])).values()];

  return places
    .filter((p) => p.rating != null && p.location)
    .filter((p) => distanceMeters(area.center, p.location!) <= radius)
    // Fermés définitivement / temporairement, ou fermés à cette heure-ci. Horaires inconnus : on garde.
    .filter((p) => (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL" && p.currentOpeningHours?.openNow !== false)
    // Une cuisine en mode rapide : la recherche par mot-clé ramène aussi des restos à table.
    .filter((p) => !fast || !category || p.types?.some((type) => FAST_TYPES.includes(type)))
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text ?? t("noName"),
      rating: p.rating!,
      reviews: p.userRatingCount ?? 0,
      type: p.primaryTypeDisplayName?.text ?? "",
      price: p.priceLevel ? PRICE[p.priceLevel] ?? "" : "",
      url: p.googleMapsUri ?? "",
      photo: p.photos?.[0] ? photoUrl(p.photos[0].name) : undefined,
      location: p.location!,
    }));
}

/** Double le rayon à partir de 200 m jusqu'à avoir TOP_N restos classables (ou atteindre MAX_START_RADIUS). */
export async function searchUntilTop(
  center: LatLng,
  category?: Category | null,
  fast = false,
): Promise<{ list: Restaurant[]; area: Area }> {
  for (let radius = START_RADIUS; ; radius *= 2) {
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
