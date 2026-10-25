import { getLocales } from "expo-localization";

/**
 * Traductions FR / EN / ES. La langue suit l'iPhone (ou celle choisie pour l'app dans Réglages),
 * sinon français. iOS relance l'app quand on change de langue : pas besoin de la suivre en direct.
 */
export const LANGS = ["fr", "en", "es"] as const;
export type Lang = (typeof LANGS)[number];

export const lang: Lang =
  getLocales()
    .map((l) => l.languageCode)
    .find((c): c is Lang => LANGS.includes(c as Lang)) ?? "fr";

/** Pour les nombres et distances (séparateur décimal). */
export const locale = { fr: "fr-FR", en: "en-US", es: "es-ES" }[lang];

const fr = {
  cuisineType: "Type de cuisine",
  localSpecialty: "Spécialité du coin",
  appName: "J'ai faim",
  tagline: "Les 5 meilleures tables, juste à côté.",
  taglineSurprise: "5 tables au hasard, juste à côté.",
  locating: "Je te localise…",
  searching: "Je renifle les cuisines du coin…",
  nothingOpen: "Rien d'ouvert et bien noté par ici… dézoome la carte ?",
  topWithin: "Top {n} dans un rayon de {radius} · dézoome pour voir plus loin",
  randomWithin: "{n} restos au hasard dans un rayon de {radius}",
  geolocationDenied: "Je n'ai pas eu accès à ta position.",
  askAddress: "Dis-moi où tu es :",
  addressPlaceholder: "12 rue des Martyrs, Paris",
  addressNotFound: "Adresse introuvable.",
  go: "Go",
  oops: "Oups, quelque chose a coincé.",
  missingKey: "Clé Google manquante (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).",
  googleError: "Google a répondu {status}.",
  reviews: "avis",
  noName: "Sans nom",
  openInMaps: "Ouvre la fiche Google Maps",
  directionsTo: "Itinéraire vers {name}",
  surpriseMode: "Mode surprise",
  surpriseTip: "Mode surprise : 5 restos ouverts tirés au sort, bien notés ou pas. Pour sortir des sentiers battus.",
  reroll: "Autre tirage",
  ladyLabel: "La petite dame a faim",
  ladyPif: "AU PIF !",
  footer: "Données Google Maps · touche la dame 👆 ·",
  privacy: "Confidentialité",
};

type Dict = typeof fr;

const en: Dict = {
  cuisineType: "Type of cuisine",
  localSpecialty: "Local specialty",
  appName: "I'm hungry",
  tagline: "The 5 best tables, right around the corner.",
  taglineSurprise: "5 random tables, right around the corner.",
  locating: "Finding you…",
  searching: "Sniffing out the local kitchens…",
  nothingOpen: "Nothing open and well rated around here… zoom out the map?",
  topWithin: "Top {n} within {radius} · zoom out to see further",
  randomWithin: "{n} random restaurants within {radius}",
  geolocationDenied: "I couldn't get your location.",
  askAddress: "Tell me where you are:",
  addressPlaceholder: "221B Baker Street, London",
  addressNotFound: "Address not found.",
  go: "Go",
  oops: "Oops, something went wrong.",
  missingKey: "Missing Google key (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).",
  googleError: "Google responded {status}.",
  reviews: "reviews",
  noName: "Unnamed",
  openInMaps: "Opens the Google Maps page",
  directionsTo: "Directions to {name}",
  surpriseMode: "Surprise mode",
  surpriseTip: "Surprise mode: 5 open restaurants picked at random, highly rated or not. Get off the beaten track.",
  reroll: "Pick again",
  ladyLabel: "The little lady is hungry",
  ladyPif: "EENY MEENY!",
  footer: "Google Maps data · tap the lady 👆 ·",
  privacy: "Privacy",
};

const es: Dict = {
  cuisineType: "Tipo de cocina",
  localSpecialty: "Especialidad local",
  appName: "Tengo hambre",
  tagline: "Las 5 mejores mesas, a la vuelta de la esquina.",
  taglineSurprise: "5 mesas al azar, a la vuelta de la esquina.",
  locating: "Te estoy buscando…",
  searching: "Olfateando las cocinas de la zona…",
  nothingOpen: "Nada abierto y bien valorado por aquí… ¿alejas el mapa?",
  topWithin: "Top {n} en un radio de {radius} · aleja el mapa para ver más",
  randomWithin: "{n} restaurantes al azar en un radio de {radius}",
  geolocationDenied: "No pude acceder a tu ubicación.",
  askAddress: "Dime dónde estás:",
  addressPlaceholder: "Calle Mayor 1, Madrid",
  addressNotFound: "Dirección no encontrada.",
  go: "Ir",
  oops: "Uy, algo ha fallado.",
  missingKey: "Falta la clave de Google (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).",
  googleError: "Google respondió {status}.",
  reviews: "reseñas",
  noName: "Sin nombre",
  openInMaps: "Abre la ficha de Google Maps",
  directionsTo: "Cómo llegar a {name}",
  surpriseMode: "Modo sorpresa",
  surpriseTip: "Modo sorpresa: 5 restaurantes abiertos elegidos al azar, bien valorados o no. Para salirse de lo de siempre.",
  reroll: "Otra vez",
  ladyLabel: "La señora tiene hambre",
  ladyPif: "¡A LO LOCO!",
  footer: "Datos de Google Maps · toca a la señora 👆 ·",
  privacy: "Privacidad",
};

const dicts: Record<Lang, Dict> = { fr, en, es };

/** Texte traduit ; les {variables} sont remplacées. */
export function t(key: keyof Dict, vars: Record<string, string | number> = {}): string {
  return dicts[lang][key].replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`));
}
