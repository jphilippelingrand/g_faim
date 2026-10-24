import Constants from "expo-constants";
import { Platform } from "react-native";

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
// Limite de searchNearby.
export const MAX_RADIUS = 50_000;

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
  "priceLevel", "primaryTypeDisplayName", "photos", "businessStatus", "currentOpeningHours.openNow",
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

/**
 * Restos notés et ouverts en ce moment dans le cercle (max 20, limite de l'API).
 * searchNearby ne trie pas par note : le classement se fait dans rankTop.
 */
export async function searchRestaurants({ center, radius }: Area): Promise<Restaurant[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY ?? "",
      "X-Goog-FieldMask": FIELD_MASK,
      ...googleHeaders,
    },
    body: JSON.stringify({
      includedPrimaryTypes: ["restaurant"],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      languageCode: "fr",
      locationRestriction: { circle: { center, radius: Math.min(radius, MAX_RADIUS) } },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Google a répondu ${res.status}.`);

  return ((json.places ?? []) as ApiPlace[])
    .filter((p) => p.rating != null && p.location)
    // Fermés définitivement / temporairement, ou fermés à cette heure-ci. Horaires inconnus : on garde.
    .filter((p) => (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL" && p.currentOpeningHours?.openNow !== false)
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text ?? "Sans nom",
      rating: p.rating!,
      reviews: p.userRatingCount ?? 0,
      type: p.primaryTypeDisplayName?.text ?? "",
      price: p.priceLevel ? PRICE[p.priceLevel] ?? "" : "",
      url: p.googleMapsUri ?? "",
      photo: p.photos?.[0] ? photoUrl(p.photos[0].name) : undefined,
      location: p.location!,
    }));
}

/** Double le rayon à partir de 200 m jusqu'à avoir TOP_N restos classables. */
export async function searchUntilTop(center: LatLng): Promise<{ list: Restaurant[]; area: Area }> {
  for (let radius = START_RADIUS; ; radius = Math.min(radius * 2, MAX_RADIUS)) {
    const area = { center, radius };
    const list = await searchRestaurants(area);
    if (rankTop(list).length >= TOP_N || radius >= MAX_RADIUS) return { list, area };
  }
}

/** Trie par note puis nombre d'avis, en ignorant les restos trop peu notés. */
export function rankTop(list: Restaurant[]): Restaurant[] {
  return list
    .filter((r) => r.reviews >= MIN_REVIEWS)
    .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
    .slice(0, TOP_N);
}

export function formatDistance(m: number): string {
  return m >= 1000
    ? `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`
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
