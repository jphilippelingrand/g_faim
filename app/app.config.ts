import type { ExpoConfig } from "expo/config";

export const BUNDLE_ID = "com.jphilippelingrand.gfaim";
// Partagé entre l'app et le widget (dernier verdict). À déclarer aussi sur le portail Apple Developer.
export const APP_GROUP = `group.${BUNDLE_ID}`;

const config: ExpoConfig = {
  name: "Groubl",
  slug: "g-faim",
  scheme: "gfaim",
  // Vient du tag git avec le workflow EAS (« v1.0.2 » → 1.0.2) ; sinon (build lancé à la main), cette valeur.
  // Le numéro de build est géré par EAS.
  version: process.env.APP_VERSION?.replace(/^v/, "") || "1.0.1",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Nécessaire pour que les traductions de languages/*.json (permission, nom) soient utilisées.
      CFBundleAllowMixedLocalizations: true,
    },
    // Le widget lit le dernier verdict dans les UserDefaults de ce groupe (recopié sur la cible du widget).
    entitlements: {
      "com.apple.security.application-groups": [APP_GROUP],
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: "#fbf6ef",
      foregroundImage: "./assets/android-icon-foreground.png",
    },
  },
  locales: {
    fr: "./languages/fr.json",
    en: "./languages/en.json",
    es: "./languages/es.json",
  },
  plugins: [
    // Permet de choisir la langue de l'app dans Réglages iOS.
    ["expo-localization", { supportedLocales: ["fr", "en", "es"] }],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Groubl utilise ta position pour trouver les restos ouverts les plus proches de toi.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        backgroundColor: "#fbf6ef",
      },
    ],
    "expo-font",
    // Cibles natives de targets/ : le widget (SwiftUI) et le raccourci Siri « J'ai faim » (targets/widget/_shared).
    "@bacons/apple-targets",
    // Phrases Siri du raccourci en fr / en / es (languages/app-shortcuts.json).
    "./plugins/withAppShortcutsStrings",
  ],
  extra: {
    eas: {
      projectId: "f818409b-8c89-47e6-abef-dc5e62d0ed87",
    },
  },
};

export default config;
