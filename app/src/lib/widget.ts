import { Platform } from "react-native";
import { lang } from "../i18n";

/**
 * Le dernier verdict, affiché par le widget d'écran d'accueil (targets/widget).
 * `closing` est l'heure déjà formatée (« 23 h », « 11 PM »…) : le widget l'affiche
 * en « ouvert jusqu'à 23 h » ; null si on ne la connaît pas (ou ouvert 24 h/24).
 */
export type WidgetVerdict = {
  name: string;
  minutes: number;
  mode: "walk" | "drive";
  closing: string | null;
};

// Doivent correspondre à app.config.ts (APP_GROUP) et à targets/widget/GroublWidget.swift.
const APP_GROUP = "group.com.jphilippelingrand.gfaim";
const VERDICT_KEY = "verdict";
const WIDGET_KIND = "GroublWidget";

type Storage = typeof import("@bacons/apple-targets").ExtensionStorage;

// Chargé à la demande : le module natif n'existe pas dans Expo Go ni sur Android.
let storageClass: Storage | null | undefined;
function getStorage(): Storage | null {
  if (storageClass !== undefined) return storageClass;
  storageClass = null;
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    storageClass = (require("@bacons/apple-targets") as typeof import("@bacons/apple-targets")).ExtensionStorage;
  } catch {
    storageClass = null;
  }
  return storageClass;
}

/**
 * Dépose le verdict dans le groupe partagé et redessine le widget ; null l'efface
 * (le widget repasse au « Ton ventre gargouille ? Touche-moi. »). Sans effet là où ce n'est pas possible.
 */
export function updateWidget(verdict: WidgetVerdict | null): void {
  const Storage = getStorage();
  if (!Storage) return;
  try {
    const storage = new Storage(APP_GROUP);
    if (verdict) {
      const data: Record<string, string | number> = {
        name: verdict.name,
        minutes: Math.max(1, Math.round(verdict.minutes)),
        mode: verdict.mode,
        lang,
        // Le widget repasse au « Touche-moi » quand le verdict a plus de 3 h.
        savedAt: Date.now(),
      };
      if (verdict.closing) data.closing = verdict.closing;
      storage.set(VERDICT_KEY, data);
    } else {
      storage.remove(VERDICT_KEY);
    }
    Storage.reloadWidget(WIDGET_KIND);
  } catch {
    // Module natif absent (Expo Go, vieux build) : le widget attendra.
  }
}
