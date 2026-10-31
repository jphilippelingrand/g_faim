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
  support: "Support",
  appName: "Groubl",
  locating: "Je te localise…",
  nothingOpen: "Rien d'ouvert par ici… pour l'instant.",
  geolocationDenied: "Je n'ai pas eu accès à ta position.",
  askAddress: "Dis-moi où tu es :",
  addressPlaceholder: "12 rue des Martyrs, Paris",
  addressNotFound: "Adresse introuvable.",
  go: "Go",
  oops: "Oups, quelque chose a coincé.",
  openAllDay: "Ouvert 24 h/24",
  walkMinutes: "{minutes} min à pied",
  driveMinutes: "{minutes} min en voiture",
  until: "jusqu'à {time}",
  midnight: "minuit",
  nope: "NAN",
  yum: "MIAM",
  next: "Suivant",
  restart: "Recommencer autour de moi",
  share: "Envoyer aux copains",
  shareText: "{name}, {minutes} min. On y va ?",
  verdict1: "Ton ventre a tranché.",
  verdict2: "Arrête de réfléchir. Va là.",
  verdict3: "Verdict du ventre, sans appel.",
  verdict4: "C'est décidé. On ne discute plus.",
  verdict5: "Le plus proche. Ouvert. Point.",
  openWith: "Ouvrir avec…",
  mapsWith: "Cartes : {app}",
  cancel: "Annuler",
  seeInMaps: "Voir {name} dans les cartes",
  ladyLabel: "La petite dame a faim",
  ladyPif: "AU PIF !",
  ladyFast: "VITE VITE !",
  footer: "Restos © contributeurs OpenStreetMap",
  privacy: "Confidentialité",
  modeCards: "Swipe",
  modeList: "Liste",
  viewMode: "Affichage : swipe ou liste",
  loadingMore: "Je cherche plus loin…",
  allSeen: "C'est tout ce qui est ouvert autour.",
  backToFirst: "Revenir au plus proche",
};

type Dict = typeof fr;

const en: Dict = {
  support: "Support",
  appName: "Groubl",
  locating: "Finding you…",
  nothingOpen: "Nothing open around here… for now.",
  geolocationDenied: "I couldn't get your location.",
  askAddress: "Tell me where you are:",
  addressPlaceholder: "221B Baker Street, London",
  addressNotFound: "Address not found.",
  go: "Go",
  oops: "Oops, something went wrong.",
  openAllDay: "Open 24/7",
  walkMinutes: "{minutes} min walk",
  driveMinutes: "{minutes} min drive",
  until: "until {time}",
  midnight: "midnight",
  nope: "NOPE",
  yum: "YUM",
  next: "Next",
  restart: "Start over around me",
  share: "Send to friends",
  shareText: "{name}, {minutes} min away. Coming?",
  verdict1: "Your belly has spoken.",
  verdict2: "Stop thinking. Go here.",
  verdict3: "The belly's verdict. Final.",
  verdict4: "Decision made. No debate.",
  verdict5: "The closest. Open. Period.",
  openWith: "Open with…",
  mapsWith: "Maps: {app}",
  cancel: "Cancel",
  seeInMaps: "See {name} in maps",
  ladyLabel: "The little lady is hungry",
  ladyPif: "EENY MEENY!",
  ladyFast: "QUICK QUICK!",
  footer: "Places © OpenStreetMap contributors",
  privacy: "Privacy",
  modeCards: "Swipe",
  modeList: "List",
  viewMode: "View: swipe or list",
  loadingMore: "Looking further…",
  allSeen: "That's everything open around here.",
  backToFirst: "Back to the closest",
};

const es: Dict = {
  support: "Soporte",
  appName: "Groubl",
  locating: "Te estoy buscando…",
  nothingOpen: "Nada abierto por aquí… por ahora.",
  geolocationDenied: "No pude acceder a tu ubicación.",
  askAddress: "Dime dónde estás:",
  addressPlaceholder: "Calle Mayor 1, Madrid",
  addressNotFound: "Dirección no encontrada.",
  go: "Ir",
  oops: "Uy, algo ha fallado.",
  openAllDay: "Abierto 24 h",
  walkMinutes: "{minutes} min a pie",
  driveMinutes: "{minutes} min en coche",
  until: "hasta las {time}",
  midnight: "medianoche",
  nope: "NO",
  yum: "ÑAM",
  next: "Siguiente",
  restart: "Empezar de nuevo cerca de mí",
  share: "Enviar a los amigos",
  shareText: "{name}, a {minutes} min. ¿Vamos?",
  verdict1: "Tu barriga ha decidido.",
  verdict2: "Deja de pensar. Ve aquí.",
  verdict3: "Veredicto de la barriga. Sin apelación.",
  verdict4: "Decidido. No se discute.",
  verdict5: "El más cercano. Abierto. Punto.",
  openWith: "Abrir con…",
  mapsWith: "Mapas: {app}",
  cancel: "Cancelar",
  seeInMaps: "Ver {name} en el mapa",
  ladyLabel: "La señora tiene hambre",
  ladyPif: "¡A LO LOCO!",
  ladyFast: "¡RÁPIDO!",
  footer: "Restaurantes © colaboradores de OpenStreetMap",
  privacy: "Privacidad",
  modeCards: "Swipe",
  modeList: "Lista",
  viewMode: "Vista: swipe o lista",
  loadingMore: "Busco más lejos…",
  allSeen: "Eso es todo lo abierto por aquí.",
  backToFirst: "Volver al más cercano",
};

const dicts: Record<Lang, Dict> = { fr, en, es };

/** Texte traduit ; les {variables} sont remplacées. */
export function t(key: keyof Dict, vars: Record<string, string | number> = {}): string {
  return dicts[lang][key].replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`));
}
