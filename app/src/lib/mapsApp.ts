import { ActionSheetIOS, Linking, Platform, Settings } from "react-native";
import { t } from "../i18n";
import type { Restaurant } from "./places";

/**
 * Dans quelle appli de cartes ouvrir l'itinéraire (comme src/lib/mapsApp.ts du site) : Plans ou Google Maps,
 * demandé la première fois et retenu par l'iPhone (UserDefaults, via Settings).
 */
export type MapsApp = "apple" | "google";

const KEY = "mapsApp";

/** Le choix retenu ; null tant qu'on n'a pas demandé. */
export function getMapsApp(): MapsApp | null {
  if (Platform.OS !== "ios") return "google";
  const saved = Settings.get(KEY);
  return saved === "apple" || saved === "google" ? saved : null;
}

export function setMapsApp(app: MapsApp) {
  if (Platform.OS === "ios") Settings.set({ [KEY]: app });
}

/**
 * Lien d'itinéraire (une simple URL, gratuite). Avec le nom et l'adresse, l'appli ouvre la fiche du commerce
 * plutôt qu'une épingle ; sans adresse connue, on donne la position. Le lien Google Maps ouvre l'appli si elle
 * est installée, sinon le site.
 */
export function directionsUrl(r: Restaurant, walking: boolean, app: MapsApp): string {
  const target = r.address ? `${r.name}, ${r.address}` : `${r.location.latitude},${r.location.longitude}`;
  if (app === "apple") {
    const params = new URLSearchParams({ daddr: target, dirflg: walking ? "w" : "d" });
    if (!r.address) params.set("q", r.name);
    return `https://maps.apple.com/?${params}`;
  }
  const params = new URLSearchParams({ api: "1", destination: target, travelmode: walking ? "walking" : "driving" });
  return `https://www.google.com/maps/dir/?${params}`;
}

/**
 * Lien vers la fiche du resto (une recherche, pas un itinéraire) : on voit le commerce, ses photos, ses
 * horaires, et l'itinéraire est à un bouton. Avec l'adresse, l'appli retrouve le bon ; sinon, le nom autour de sa position.
 */
export function placeUrl(r: Restaurant, app: MapsApp): string {
  const { latitude, longitude } = r.location;
  if (app === "apple") {
    const params = new URLSearchParams({ q: r.address ? `${r.name}, ${r.address}` : r.name, ll: `${latitude},${longitude}` });
    return `https://maps.apple.com/?${params}`;
  }
  const params = new URLSearchParams({ api: "1", query: r.address ? `${r.name}, ${r.address}` : `${latitude},${longitude}` });
  return `https://www.google.com/maps/search/?${params}`;
}

/** « Ouvrir avec… » : Plans ou Google Maps (feuille d'actions iOS). null si on annule. */
export function askMapsApp(): Promise<MapsApp | null> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      { title: t("openWith"), options: [t("appleMaps"), "Google Maps", t("cancel")], cancelButtonIndex: 2 },
      (i) => resolve(i === 0 ? "apple" : i === 1 ? "google" : null),
    );
  });
}

/** L'appli retenue ; la première fois, on demande laquelle. null si on annule. */
async function chosenMapsApp(): Promise<MapsApp | null> {
  const saved = getMapsApp();
  if (saved) return saved;
  const app = await askMapsApp();
  if (app) setMapsApp(app);
  return app;
}

/** Ouvre l'itinéraire dans l'appli retenue (raccourci Siri « j'ai faim » : on part tout de suite). */
export async function openDirections(r: Restaurant, walking: boolean): Promise<MapsApp | null> {
  const app = await chosenMapsApp();
  if (app) await Linking.openURL(directionsUrl(r, walking, app));
  return app;
}

/** Ouvre la fiche du resto dans l'appli retenue (swipe à droite, ♥, « Go » de la liste). */
export async function openPlace(r: Restaurant): Promise<MapsApp | null> {
  const app = await chosenMapsApp();
  if (app) await Linking.openURL(placeUrl(r, app));
  return app;
}
