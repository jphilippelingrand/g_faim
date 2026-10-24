import { importLibrary } from "./google";

export type LatLng = { lat: number; lng: number };

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

const PRICE: Record<string, string> = {
  INEXPENSIVE: "€",
  MODERATE: "€€",
  EXPENSIVE: "€€€",
  VERY_EXPENSIVE: "€€€€",
};

export function getBrowserPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Ton navigateur ne sait pas où tu es."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error("Je n'ai pas eu accès à ta position.")),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export async function geocode(address: string): Promise<LatLng> {
  const { Geocoder } = await importLibrary<google.maps.GeocodingLibrary>("geocoding");
  const { results } = await new Geocoder().geocode({ address });
  if (!results.length) throw new Error("Adresse introuvable.");
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

/**
 * Tous les restos notés dans le cercle (max 20, limite de l'API).
 * searchNearby ne trie pas par note : le classement se fait dans rankTop.
 */
export async function searchRestaurants({ center, radius }: Area): Promise<Restaurant[]> {
  const { Place, SearchNearbyRankPreference } = await importLibrary<google.maps.PlacesLibrary>("places");

  const { places } = await Place.searchNearby({
    fields: [
      "id", "displayName", "rating", "userRatingCount", "location",
      "googleMapsURI", "priceLevel", "primaryTypeDisplayName", "photos",
    ],
    locationRestriction: { center, radius: Math.min(radius, MAX_RADIUS) },
    includedPrimaryTypes: ["restaurant"],
    maxResultCount: 20,
    rankPreference: SearchNearbyRankPreference.POPULARITY,
  });

  return places
    .filter((p) => p.rating != null && p.location)
    .map((p) => ({
      id: p.id,
      name: p.displayName ?? "Sans nom",
      rating: p.rating!,
      reviews: p.userRatingCount ?? 0,
      type: p.primaryTypeDisplayName ?? "",
      price: p.priceLevel ? PRICE[p.priceLevel] ?? "" : "",
      url: p.googleMapsURI ?? "",
      photo: p.photos?.[0]?.getURI({ maxWidth: 200, maxHeight: 200 }),
      location: { lat: p.location!.lat(), lng: p.location!.lng() },
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
