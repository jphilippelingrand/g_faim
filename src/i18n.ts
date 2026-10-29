/**
 * Traductions FR / EN / ES. La langue est choisie au démarrage (choix mémorisé, sinon langue du
 * navigateur, sinon français) ; en changer recharge la page.
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
  appName: "Groubl",
  tagline: "Les 5 restos ouverts les plus proches.",
  locating: "Je te localise…",
  sniffing: "Je renifle…",
  nothingOpen: "Rien d'ouvert autour de toi… pour l'instant.",
  noGeolocation: "Ton navigateur ne sait pas où tu es.",
  geolocationDenied: "Je n'ai pas eu accès à ta position.",
  askAddress: "Dis-moi où tu es :",
  addressPlaceholder: "12 rue des Martyrs, Paris",
  addressNotFound: "Adresse introuvable.",
  go: "Go",
  oops: "Oups, quelque chose a coincé.",
  hoursUnknown: "Horaires inconnus",
  openAllDay: "Ouvert 24 h/24",
  openUntil: "Ouvert jusqu'à {time}",
  walkMinutes: "{minutes} min à pied",
  driveMinutes: "{minutes} min en voiture",
  directions: "Itinéraire",
  directionsTo: "Itinéraire vers {name}",
  aroundMe: "↺ Autour de moi",
  backToTop: "Remonter en haut",
  ladyLabel: "La petite dame a faim",
  ladyPif: "AU PIF !",
  ladyFast: "VITE VITE !",
  you: "Toi",
  footerData: "Restos et carte ©",
  footerPoke: "clique sur la dame 👆",
  privacy: "Confidentialité",
  language: "Langue",
};

type Dict = typeof fr;

const en: Dict = {
  appName: "Groubl",
  tagline: "The 5 closest places open right now.",
  locating: "Finding you…",
  sniffing: "Sniffing around…",
  nothingOpen: "Nothing open around you… for now.",
  noGeolocation: "Your browser doesn't know where you are.",
  geolocationDenied: "I couldn't get your location.",
  askAddress: "Tell me where you are:",
  addressPlaceholder: "221B Baker Street, London",
  addressNotFound: "Address not found.",
  go: "Go",
  oops: "Oops, something went wrong.",
  hoursUnknown: "Hours unknown",
  openAllDay: "Open 24/7",
  openUntil: "Open until {time}",
  walkMinutes: "{minutes} min walk",
  driveMinutes: "{minutes} min drive",
  directions: "Directions",
  directionsTo: "Directions to {name}",
  aroundMe: "↺ Around me",
  backToTop: "Back to top",
  ladyLabel: "The little lady is hungry",
  ladyPif: "EENY MEENY!",
  ladyFast: "QUICK QUICK!",
  you: "You",
  footerData: "Places and map ©",
  footerPoke: "tap the lady 👆",
  privacy: "Privacy",
  language: "Language",
};

const es: Dict = {
  appName: "Groubl",
  tagline: "Los 5 restaurantes abiertos más cercanos.",
  locating: "Te estoy buscando…",
  sniffing: "Olfateando…",
  nothingOpen: "Nada abierto cerca de ti… por ahora.",
  noGeolocation: "Tu navegador no sabe dónde estás.",
  geolocationDenied: "No pude acceder a tu ubicación.",
  askAddress: "Dime dónde estás:",
  addressPlaceholder: "Calle Mayor 1, Madrid",
  addressNotFound: "Dirección no encontrada.",
  go: "Ir",
  oops: "Uy, algo ha fallado.",
  hoursUnknown: "Horario desconocido",
  openAllDay: "Abierto 24 h",
  openUntil: "Abierto hasta las {time}",
  walkMinutes: "{minutes} min a pie",
  driveMinutes: "{minutes} min en coche",
  directions: "Cómo llegar",
  directionsTo: "Cómo llegar a {name}",
  aroundMe: "↺ Cerca de mí",
  backToTop: "Volver arriba",
  ladyLabel: "La señora tiene hambre",
  ladyPif: "¡A LO LOCO!",
  ladyFast: "¡RÁPIDO!",
  you: "Tú",
  footerData: "Restaurantes y mapa ©",
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
