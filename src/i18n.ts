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
  tagline: "Ouvert. Proche. Maintenant.",
  locating: "Je te localise…",
  nothingOpen: "Rien d'ouvert autour de toi… pour l'instant.",
  noGeolocation: "Ton navigateur ne sait pas où tu es.",
  geolocationDenied: "Je n'ai pas eu accès à ta position.",
  askAddress: "Dis-moi où tu es :",
  addressPlaceholder: "12 rue des Martyrs, Paris",
  addressNotFound: "Adresse introuvable.",
  go: "Y aller",
  oops: "Oups, quelque chose a coincé.",
  openAllDay: "Ouvert 24 h/24",
  share: "Envoyer aux copains",
  shareText: "{name}, {minutes} min. On y va ?",
  midnight: "minuit",
  until: "jusqu'à {time}",
  walkMinutes: "{minutes} min à pied",
  driveMinutes: "{minutes} min en voiture",
  nope: "NAN",
  yum: "MIAM",
  next: "Suivant",
  restart: "Recommencer autour de moi",
  verdict1: "Ton ventre a tranché.",
  verdict2: "Arrête de réfléchir. Va là.",
  verdict3: "Verdict du ventre, sans appel.",
  verdict4: "C'est décidé. On ne discute plus.",
  verdict5: "Le plus proche. Ouvert. Point.",
  directions: "Itinéraire",
  directionsTo: "Itinéraire vers {name}",
  aroundMe: "↺ Autour de moi",
  ladyLabel: "La petite dame a faim",
  ladyPif: "AU PIF !",
  ladyFast: "VITE VITE !",
  you: "Toi",
  privacy: "Confidentialité",
  language: "Langue",
};

type Dict = typeof fr;

const en: Dict = {
  appName: "Groubl",
  tagline: "Open. Close. Now.",
  locating: "Finding you…",
  nothingOpen: "Nothing open around you… for now.",
  noGeolocation: "Your browser doesn't know where you are.",
  geolocationDenied: "I couldn't get your location.",
  askAddress: "Tell me where you are:",
  addressPlaceholder: "221B Baker Street, London",
  addressNotFound: "Address not found.",
  go: "Go",
  oops: "Oops, something went wrong.",
  openAllDay: "Open 24/7",
  share: "Send to friends",
  shareText: "{name}, {minutes} min away. Coming?",
  midnight: "midnight",
  until: "until {time}",
  walkMinutes: "{minutes} min walk",
  driveMinutes: "{minutes} min drive",
  nope: "NOPE",
  yum: "YUM",
  next: "Next",
  restart: "Start over around me",
  verdict1: "Your belly has spoken.",
  verdict2: "Stop thinking. Go here.",
  verdict3: "The belly's verdict. Final.",
  verdict4: "Decision made. No debate.",
  verdict5: "The closest. Open. Period.",
  directions: "Directions",
  directionsTo: "Directions to {name}",
  aroundMe: "↺ Around me",
  ladyLabel: "The little lady is hungry",
  ladyPif: "EENY MEENY!",
  ladyFast: "QUICK QUICK!",
  you: "You",
  privacy: "Privacy",
  language: "Language",
};

const es: Dict = {
  appName: "Groubl",
  tagline: "Abierto. Cerca. Ya.",
  locating: "Te estoy buscando…",
  nothingOpen: "Nada abierto cerca de ti… por ahora.",
  noGeolocation: "Tu navegador no sabe dónde estás.",
  geolocationDenied: "No pude acceder a tu ubicación.",
  askAddress: "Dime dónde estás:",
  addressPlaceholder: "Calle Mayor 1, Madrid",
  addressNotFound: "Dirección no encontrada.",
  go: "Ir",
  oops: "Uy, algo ha fallado.",
  openAllDay: "Abierto 24 h",
  share: "Enviar a los amigos",
  shareText: "{name}, a {minutes} min. ¿Vamos?",
  midnight: "medianoche",
  until: "hasta las {time}",
  walkMinutes: "{minutes} min a pie",
  driveMinutes: "{minutes} min en coche",
  nope: "NO",
  yum: "ÑAM",
  next: "Siguiente",
  restart: "Empezar de nuevo cerca de mí",
  verdict1: "Tu barriga ha decidido.",
  verdict2: "Deja de pensar. Ve aquí.",
  verdict3: "Veredicto de la barriga. Sin apelación.",
  verdict4: "Decidido. No se discute.",
  verdict5: "El más cercano. Abierto. Punto.",
  directions: "Cómo llegar",
  directionsTo: "Cómo llegar a {name}",
  aroundMe: "↺ Cerca de mí",
  ladyLabel: "La señora tiene hambre",
  ladyPif: "¡A LO LOCO!",
  ladyFast: "¡RÁPIDO!",
  you: "Tú",
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
