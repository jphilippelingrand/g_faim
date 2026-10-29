// Raccourci Siri / Spotlight « J'ai faim » : rien à configurer, il apparaît dès l'installation.
// Ce fichier est dans _shared/, donc compilé dans l'app ET dans le widget ; le raccourci ne doit
// exister que dans l'app : seule l'app voit les modules Expo, d'où le #if.
#if canImport(Expo)
import AppIntents
import Foundation

// OpenURLIntent (iOS 18) ouvre l'app avec le lien, même si elle était fermée : le JS le lit
// avec Linking.getInitialURL (ou l'événement « url » si elle tournait déjà).
@available(iOS 18.0, *)
struct JaiFaimIntent: AppIntent {
  static let title: LocalizedStringResource = "I'm hungry"
  static let description = IntentDescription("Opens Groubl and heads to the closest place open right now.")

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "gfaim://?faim=1")!))
  }
}

// Les phrases sont en anglais (langue de développement) ; les traductions sont dans languages/app-shortcuts.json.
@available(iOS 18.0, *)
struct GroublShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: JaiFaimIntent(),
      phrases: [
        "I'm hungry with \(.applicationName)",
        "\(.applicationName), I'm hungry",
        "Feed me with \(.applicationName)",
        "\(.applicationName), my belly is rumbling",
      ],
      shortTitle: "I'm hungry",
      systemImageName: "fork.knife"
    )
  }

  static let shortcutTileColor: ShortcutTileColor = .orange
}
#endif
