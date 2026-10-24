import type { ExpoConfig } from "expo/config";

// Clé Google : Maps SDK for iOS + Places API (New), restreinte à l'app iOS (bundle ID ci-dessous).
const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export const BUNDLE_ID = "com.jphilippelingrand.gfaim";

const config: ExpoConfig = {
  name: "J'ai faim",
  slug: "g-faim",
  scheme: "gfaim",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: "#fbf6ef",
      foregroundImage: "./assets/android-icon-foreground.png",
    },
  },
  plugins: [
    [
      "expo-location",
      {
        locationWhenInUsePermission: "J'ai faim utilise ta position pour trouver les meilleurs restos ouverts autour de toi.",
      },
    ],
    ["react-native-maps", { iosGoogleMapsApiKey: GOOGLE_KEY, androidGoogleMapsApiKey: GOOGLE_KEY }],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        backgroundColor: "#fbf6ef",
      },
    ],
    "expo-font",
  ],
  extra: {
    eas: {
      projectId: "f818409b-8c89-47e6-abef-dc5e62d0ed87",
    },
  },
};

export default config;
