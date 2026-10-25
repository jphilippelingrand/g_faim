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
  /** Type Google (ex. "sushi_restaurant"), sert aux catégories. */
  primaryType: string;
  /** Ouvert en ce moment ; undefined si Google ne connaît pas les horaires. */
  open?: boolean;
  price: string;
  url: string;
  photo?: string;
  location: LatLng;
};

/** Une catégorie de cuisine, tirée des types Google des restos trouvés. */
export type Category = { type: string; label: string; count: number };

export const TOP_N = 5;
// Écarte les 5,0★ à 3 avis qui squatteraient le podium.
const MIN_REVIEWS = 10;
const START_RADIUS = 200;
// Au démarrage, on n'élargit pas au-delà (pire cas : 6 étapes) ; dézoomer permet d'aller plus loin.
const MAX_START_RADIUS = 6400;
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
  "googleMapsURI", "priceLevel", "primaryType", "primaryTypeDisplayName", "photos",
  "businessStatus", "currentOpeningHours", "regularOpeningHours", "utcOffsetMinutes",
];

/** Le carré qui contient le cercle (searchByText n'accepte que des rectangles). */
function circleBounds({ center, radius }: Area): google.maps.LatLngBoundsLiteral {
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return { north: center.lat + dLat, south: center.lat - dLat, east: center.lng + dLng, west: center.lng - dLng };
}

/**
 * Restos notés dans le cercle, avec leur statut d'ouverture. Deux recherches en parallèle, fusionnées :
 * - searchNearby : les 20 plus populaires, mais ouverts ou non (la nuit, souvent presque tous fermés) ;
 * - searchByText filtré par Google sur « ouvert maintenant » : 20 restos ouverts, même à 1 h du matin.
 * Aucune ne trie par note : le classement se fait dans rankTop.
 */
export async function searchRestaurants(area: Area, category?: Category | null): Promise<Restaurant[]> {
  const { Place, SearchNearbyRankPreference } = await importLibrary<google.maps.PlacesLibrary>("places");
  const radius = Math.min(area.radius, MAX_RADIUS);

  const responses = await Promise.allSettled([
    Place.searchNearby({
      fields: FIELDS,
      locationRestriction: { center: area.center, radius },
      includedPrimaryTypes: [category?.type ?? "restaurant"],
      maxResultCount: 20,
      rankPreference: SearchNearbyRankPreference.POPULARITY,
    }),
    Place.searchByText({
      fields: FIELDS,
      textQuery: category?.label ?? "restaurant",
      includedType: category?.type ?? "restaurant",
      useStrictTypeFiltering: true,
      isOpenNow: true,
      locationRestriction: circleBounds({ center: area.center, radius }),
      maxResultCount: 20,
    }),
  ]);
  const ok = responses.filter((r) => r.status === "fulfilled").map((r) => r.value.places);
  if (!ok.length) throw (responses[0] as PromiseRejectedResult).reason;
  const places = [...new Map(ok.flat().map((p) => [p.id, p])).values()];

  return places
    .filter((p) => p.rating != null && p.location)
    .filter((p) => distanceMeters(area.center, { lat: p.location!.lat(), lng: p.location!.lng() }) <= radius)
    // Fermés définitivement / temporairement : on écarte. Fermés à cette heure-ci : gardés pour les
    // catégories (elles décrivent le quartier), écartés du classement par rankTop.
    .filter((p) => (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL")
    .map((p) => ({
      id: p.id,
      name: p.displayName ?? "Sans nom",
      rating: p.rating!,
      reviews: p.userRatingCount ?? 0,
      type: p.primaryTypeDisplayName ?? "",
      primaryType: p.primaryType ?? "",
      open: isOpenNow(p),
      price: p.priceLevel ? PRICE[p.priceLevel] ?? "" : "",
      url: p.googleMapsURI ?? "",
      photo: p.photos?.[0]?.getURI({ maxWidth: 200, maxHeight: 200 }),
      location: { lat: p.location!.lat(), lng: p.location!.lng() },
    }));
}

/** Double le rayon à partir de 200 m jusqu'à avoir TOP_N restos classables (ou atteindre MAX_START_RADIUS). */
export async function searchUntilTop(
  center: LatLng,
  category?: Category | null,
): Promise<{ list: Restaurant[]; area: Area }> {
  for (let radius = START_RADIUS; ; radius *= 2) {
    const area = { center, radius };
    const list = await searchRestaurants(area, category);
    if (rankTop(list).length >= TOP_N || radius >= MAX_START_RADIUS) return { list, area };
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

export function formatDistance(m: number): string {
  return m >= 1000
    ? `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`
    : `${Math.round(m)} m`;
}

// Types trop vagues pour faire une catégorie.
const GENERIC_TYPES = new Set(["restaurant", "food", "establishment", "point_of_interest"]);
const MAX_CATEGORIES = 8;

/** "Restaurant de sushis" → "Sushis", "Restaurant servant le petit-déjeuner" → "Petit-déjeuner", "Pizzeria" → "Pizzeria". */
function shortLabel(displayName: string): string {
  const s = displayName.replace(/^restaurant\s+(servant\s+(le\s+|la\s+|les\s+)?|de\s+|d'|des\s+|du\s+)?/i, "").trim() || displayName;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Les cuisines les plus représentées parmi les restos vus autour, ouverts ou non : elles décrivent
 * le quartier. Rien n'est codé en dur : à Bayonne ça fait ressortir le basque, dans le 9e le français.
 */
export function topCategories(list: Restaurant[]): Category[] {
  const byType = new Map<string, Category>();
  for (const r of list.filter(hasEnoughReviews)) {
    if (!r.primaryType || GENERIC_TYPES.has(r.primaryType) || !r.type) continue;
    const c = byType.get(r.primaryType) ?? { type: r.primaryType, label: shortLabel(r.type), count: 0 };
    c.count++;
    byType.set(r.primaryType, c);
  }
  return [...byType.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_CATEGORIES);
}
