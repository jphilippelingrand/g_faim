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

/** « Ouvrir avec… » : Plans ou Google Maps (feuille d'actions iOS). null si on annule. */
export function askMapsApp(): Promise<MapsApp | null> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      { title: t("openWith"), options: ["Plans", "Google Maps", t("cancel")], cancelButtonIndex: 2 },
      (i) => resolve(i === 0 ? "apple" : i === 1 ? "google" : null),
    );
  });
}

/** Ouvre l'itinéraire dans l'appli retenue ; la première fois, on demande laquelle. */
export async function openDirections(r: Restaurant, walking: boolean): Promise<MapsApp | null> {
  let app = getMapsApp();
  if (!app) {
    app = await askMapsApp();
    if (!app) return null;
    setMapsApp(app);
  }
  await Linking.openURL(directionsUrl(r, walking, app));
  return app;
}
