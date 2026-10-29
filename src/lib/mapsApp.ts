import type { LatLng, Restaurant } from "./places";

/**
 * Dans quelle appli de cartes ouvrir l'itinéraire. Sur iPhone et iPad, l'utilisateur choisit (Plans ou
 * Google Maps) la première fois et on retient son choix ; ailleurs, c'est Google Maps, dans un nouvel onglet.
 */
export type MapsApp = "apple" | "google";

export const IS_APPLE = /iPhone|iPad|iPod/.test(navigator.userAgent);
const STORAGE_KEY = "groubl:maps";

/** Le choix retenu ; null sur iPhone tant qu'on n'a pas demandé. */
export function getMapsApp(): MapsApp | null {
  if (!IS_APPLE) return "google";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "apple" || saved === "google" ? saved : null;
  } catch {
    return null;
  }
}

export function setMapsApp(app: MapsApp) {
  try {
    localStorage.setItem(STORAGE_KEY, app);
  } catch {
    /* pas grave : on redemandera */
  }
}

/**
 * Lien d'itinéraire (une simple URL, pas d'API : gratuit). Avec le nom et l'adresse, l'appli ouvre la fiche
 * du commerce plutôt qu'une épingle sur des coordonnées ; sans adresse connue, on donne la position.
 */
export function directionsUrl(home: LatLng, r: Restaurant, walking: boolean, app: MapsApp = getMapsApp() ?? "apple"): string {
  const target = r.address ? `${r.name}, ${r.address}` : `${r.location.lat},${r.location.lng}`;
  if (app === "apple") {
    const params = new URLSearchParams({ saddr: `${home.lat},${home.lng}`, daddr: target, dirflg: walking ? "w" : "d" });
    if (!r.address) params.set("q", r.name);
    return `https://maps.apple.com/?${params}`;
  }
  const params = new URLSearchParams({
    api: "1",
    origin: `${home.lat},${home.lng}`,
    destination: target,
    travelmode: walking ? "walking" : "driving",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

/**
 * Ouvre l'itinéraire. Sur iPhone, dans le même onglet (Safari bloque les nouvelles fenêtres hors d'un vrai
 * clic, et l'appli de cartes prend le relais) ; ailleurs, dans un nouvel onglet, sinon dans celui-ci.
 */
export function openDirections(url: string) {
  // Sans « noopener » : avec, window.open renvoie toujours null et on ne saurait pas si l'onglet est bloqué.
  const tab = IS_APPLE ? null : window.open(url, "_blank");
  if (tab) tab.opener = null;
  else location.assign(url);
}
