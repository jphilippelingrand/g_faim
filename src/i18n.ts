/**
 * Traductions FR / EN / ES. La langue est choisie au démarrage (choix mémorisé, sinon langue du
 * navigateur, sinon français) ; en changer recharge la page, pour que Google Maps suive aussi.
 */
export const LANGS = ["fr", "en", "es"] as const;
export type Lang = (typeof LANGS)[number];

const STORAGE_KEY = "jai-faim:lang";

function detectLang(): Lang {
  // La langue est dans l'adresse (/fr, /en, /es) ; la racine / redirige déjà vers la bonne.
  const fromUrl = location.pathname.split("/")[1];
  if (LANGS.includes(fromUrl as Lang)) return fromUrl as Lang;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved as Lang)) return saved as Lang;
  } catch {
    /* stockage indisponible : on suit le navigateur */
  }
  const browser = navigator.languages?.map((l) => l.slice(0, 2).toLowerCase()) ?? [];
  return browser.find((l): l is Lang => LANGS.includes(l as Lang)) ?? "fr";
}

export const lang: Lang = detectLang();
document.documentElement.lang = lang;

/** Pour les nombres et distances (séparateur décimal). */
export const locale = { fr: "fr-FR", en: "en-US", es: "es-ES" }[lang];

export function setLang(next: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* pas grave : le choix ne sera juste pas retenu */
  }
  location.assign(`/${next}${location.search}`);
}

const fr = {
  appName: "J'ai faim",
  tagline: "Les 5 meilleures tables, juste à côté.",
  taglineSurprise: "5 tables au hasard, juste à côté.",
  locating: "Je te localise…",
  sniffing: "Je renifle…",
  nothingOpen: "Rien d'ouvert par ici… dézoome la carte ?",
  noGeolocation: "Ton navigateur ne sait pas où tu es.",
  geolocationDenied: "Je n'ai pas eu accès à ta position.",
  askAddress: "Dis-moi où tu es :",
  addressPlaceholder: "12 rue des Martyrs, Paris",
  addressNotFound: "Adresse introuvable.",
  go: "Go",
  oops: "Oups, quelque chose a coincé.",
  missingKey: "Ajoute ta clé dans .env (VITE_GOOGLE_MAPS_API_KEY), puis relance npm run dev.",
  mapsFailed: "Google Maps n'a pas pu se charger.",
  googleError: "Google a répondu {status}.",
  allCuisines: "Tout",
  cuisineType: "Type de cuisine",
  localSpecialty: "Spécialité du coin",
  reviews: "avis",
  noName: "Sans nom",
  directions: "Itinéraire",
  directionsTo: "Itinéraire vers {name}",
  surpriseMode: "Mode surprise",
  surpriseTip: "Mode surprise : 5 restos ouverts tirés au sort, bien notés ou pas. Pour sortir des sentiers battus.",
  reroll: "↻ Autre tirage",
  backToTop: "Remonter en haut",
  ladyLabel: "La petite dame a faim",
  ladyPif: "AU PIF !",
  you: "Toi",
  footerData: "Données Google Maps · cuisines ©",
  footerPoke: "clique sur la dame 👆",
  privacy: "Confidentialité",
  language: "Langue",
};

type Dict = typeof fr;

const en: Dict = {
  appName: "I'm hungry",
  tagline: "The 5 best tables, right around the corner.",
  taglineSurprise: "5 random tables, right around the corner.",
  locating: "Finding you…",
  sniffing: "Sniffing around…",
  nothingOpen: "Nothing open around here… zoom out the map?",
  noGeolocation: "Your browser doesn't know where you are.",
  geolocationDenied: "I couldn't get your location.",
  askAddress: "Tell me where you are:",
  addressPlaceholder: "221B Baker Street, London",
  addressNotFound: "Address not found.",
  go: "Go",
  oops: "Oops, something went wrong.",
  missingKey: "Add your key to .env (VITE_GOOGLE_MAPS_API_KEY), then restart npm run dev.",
  mapsFailed: "Google Maps failed to load.",
  googleError: "Google responded {status}.",
  allCuisines: "All",
  cuisineType: "Type of cuisine",
  localSpecialty: "Local specialty",
  reviews: "reviews",
  noName: "Unnamed",
  directions: "Directions",
  directionsTo: "Directions to {name}",
  surpriseMode: "Surprise mode",
  surpriseTip: "Surprise mode: 5 open restaurants picked at random, highly rated or not. Get off the beaten track.",
  reroll: "↻ Pick again",
  backToTop: "Back to top",
  ladyLabel: "The little lady is hungry",
  ladyPif: "EENY MEENY!",
  you: "You",
  footerData: "Google Maps data · cuisines ©",
  footerPoke: "tap the lady 👆",
  privacy: "Privacy",
  language: "Language",
};

const es: Dict = {
  appName: "Tengo hambre",
  tagline: "Las 5 mejores mesas, a la vuelta de la esquina.",
  taglineSurprise: "5 mesas al azar, a la vuelta de la esquina.",
  locating: "Te estoy buscando…",
  sniffing: "Olfateando…",
  nothingOpen: "Nada abierto por aquí… ¿alejas el mapa?",
  noGeolocation: "Tu navegador no sabe dónde estás.",
  geolocationDenied: "No pude acceder a tu ubicación.",
  askAddress: "Dime dónde estás:",
  addressPlaceholder: "Calle Mayor 1, Madrid",
  addressNotFound: "Dirección no encontrada.",
  go: "Ir",
  oops: "Uy, algo ha fallado.",
  missingKey: "Añade tu clave en .env (VITE_GOOGLE_MAPS_API_KEY) y reinicia npm run dev.",
  mapsFailed: "Google Maps no se pudo cargar.",
  googleError: "Google respondió {status}.",
  allCuisines: "Todo",
  cuisineType: "Tipo de cocina",
  localSpecialty: "Especialidad local",
  reviews: "reseñas",
  noName: "Sin nombre",
  directions: "Cómo llegar",
  directionsTo: "Cómo llegar a {name}",
  surpriseMode: "Modo sorpresa",
  surpriseTip: "Modo sorpresa: 5 restaurantes abiertos elegidos al azar, bien valorados o no. Para salirse de lo de siempre.",
  reroll: "↻ Otra vez",
  backToTop: "Volver arriba",
  ladyLabel: "La señora tiene hambre",
  ladyPif: "¡A LO LOCO!",
  you: "Tú",
  footerData: "Datos de Google Maps · cocinas ©",
  footerPoke: "toca a la señora 👆",
  privacy: "Privacidad",
  language: "Idioma",
};

const dicts: Record<Lang, Dict> = { fr, en, es };

/** Texte traduit ; les {variables} sont remplacées. */
export function t(key: keyof Dict, vars: Record<string, string | number> = {}): string {
  return dicts[lang][key].replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`));
}

// Nom de l'app dans la langue : onglet, nom sous l'icône quand on ajoute le site à l'écran d'accueil
// (iOS lit apple-mobile-web-app-title, Android le manifest de la langue).
document.title = t("appName");
document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", t("appName"));
document.querySelector('link[rel="manifest"]')?.setAttribute("href", `/manifest.${lang}.webmanifest`);
// Retient la langue de l'adresse, pour que groubl.com tout court y renvoie la prochaine fois.
try {
  localStorage.setItem(STORAGE_KEY, lang);
} catch {
  /* stockage indisponible */
}
