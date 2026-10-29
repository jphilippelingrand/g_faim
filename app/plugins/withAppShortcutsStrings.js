// Traductions des phrases Siri du raccourci « J'ai faim » (targets/widget/_shared/JaiFaimShortcut.swift).
// AppShortcuts.xcstrings exige iOS 17 (l'app vise 16.4) : on écrit des {lang}.lproj/AppShortcuts.strings
// dans la cible de l'app, avec le même code qu'Expo pour InfoPlist.strings (option `locales`).
const path = require("path");
const { withXcodeProject, IOSConfig } = require("expo/config-plugins");

const phrases = require("../languages/app-shortcuts.json");

module.exports = function withAppShortcutsStrings(config) {
  return withXcodeProject(config, async (config) => {
    const { projectRoot } = config.modRequest;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    config.modResults = await IOSConfig.Locales.writeStringsFile({
      localesMap: phrases,
      supportingDirectory: path.join(projectRoot, "ios", projectName, "Supporting"),
      fileName: "AppShortcuts.strings",
      projectName,
      project: config.modResults,
    });
    return config;
  });
};
