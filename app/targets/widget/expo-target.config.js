// Widget d'écran d'accueil « Ton ventre a choisi » (petit et moyen).
// Les fichiers de _shared/ (raccourci Siri « J'ai faim ») sont aussi compilés dans l'app.
// Lancer `npx expo prebuild -p ios --clean` après toute modification de ce fichier.

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "GroublWidget",
  displayName: "Groubl",
  bundleIdentifier: ".widget",
  // containerBackground et compagnie : iOS 17 minimum pour le widget (l'app reste en 16.4).
  deploymentTarget: "17.0",
  colors: {
    $widgetBackground: "#fbf6ef",
    $accent: "#e2583e",
    groublBg: "#fbf6ef",
    groublInk: "#2b211c",
    groublAccent: "#e2583e",
    groublMuted: "#8a7b70",
  },
  // Même groupe que l'app (app.config.ts) : c'est là que l'app dépose le dernier verdict. Absent tant que
  // l'App Group n'est pas créé sur le portail Apple Developer (WITH_APP_GROUP dans app.config.ts).
  entitlements: config.ios.entitlements?.["com.apple.security.application-groups"]
    ? { "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"] }
    : {},
});
