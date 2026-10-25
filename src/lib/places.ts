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
  "googleMapsURI", "priceLevel", "primaryTypeDisplayName", "photos",
  "businessStatus", "currentOpeningHours", "regularOpeningHours", "utcOffsetMinutes", "types",
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
 * En mode rapide, les mêmes recherches portent sur les types « sur le pouce » au lieu de « restaurant ».
 */
export async function searchRestaurants(area: Area, category?: Category | null, fast = false): Promise<Restaurant[]> {
  const { Place, SearchNearbyRankPreference } = await importLibrary<google.maps.PlacesLibrary>("places");
  const radius = Math.min(area.radius, MAX_RADIUS);

  const bounds = circleBounds({ center: area.center, radius });
  const responses = await Promise.allSettled(
    category
      ? // Une cuisine (venue d'OSM) : recherche Google par mot-clé, comme on le taperait dans Maps.
        [true, false].map((isOpenNow) =>
          Place.searchByText({ fields: FIELDS, textQuery: category.query, isOpenNow, locationRestriction: bounds, maxResultCount: 20 }),
        )
      : [
          Place.searchNearby({
            fields: FIELDS,
            locationRestriction: { center: area.center, radius },
            includedPrimaryTypes: fast ? FAST_TYPES : ["restaurant"],
            maxResultCount: 20,
            rankPreference: SearchNearbyRankPreference.POPULARITY,
          }),
          Place.searchByText({
            fields: FIELDS,
            // includedType n'accepte qu'un type : on prend le plus courant, les autres viennent de searchNearby.
            textQuery: fast ? "fast food" : "restaurant",
            includedType: fast ? "fast_food_restaurant" : "restaurant",
            useStrictTypeFiltering: true,
            isOpenNow: true,
            locationRestriction: bounds,
            maxResultCount: 20,
          }),
        ],
  );
  const ok = responses.filter((r) => r.status === "fulfilled").map((r) => r.value.places);
  if (!ok.length) throw (responses[0] as PromiseRejectedResult).reason;
  const places = [...new Map(ok.flat().map((p) => [p.id, p])).values()];

  return places
    .filter((p) => p.rating != null && p.location)
    .filter((p) => distanceMeters(area.center, { lat: p.location!.lat(), lng: p.location!.lng() }) <= radius)
    // Fermés définitivement / temporairement : on écarte. Fermés à cette heure-ci : gardés pour les
    // catégories (elles décrivent le quartier), écartés du classement par rankTop.
    .filter((p) => (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL")
    // Une cuisine en mode rapide : la recherche par mot-clé ramène aussi des restos à table.
    .filter((p) => !fast || !category || p.types?.some((type) => FAST_TYPES.includes(type)))
    .map((p) => ({
      id: p.id,
      name: p.displayName ?? t("noName"),
      rating: p.rating!,
      reviews: p.userRatingCount ?? 0,
      type: p.primaryTypeDisplayName ?? "",
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
  fast = false,
): Promise<{ list: Restaurant[]; area: Area }> {
  for (let radius = START_RADIUS; ; radius *= 2) {
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
