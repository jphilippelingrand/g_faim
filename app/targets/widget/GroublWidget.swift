import SwiftUI
import WidgetKit

// Le dernier verdict est déposé par l'app (src/lib/widget.ts) dans le groupe partagé, sous la clé « verdict »,
// en JSON : { name, minutes, mode: "walk" | "drive", closing?, lang, savedAt (ms) }.
private let appGroup = "group.com.jphilippelingrand.gfaim"
private let verdictKey = "verdict"
// Le même lien que le raccourci Siri : l'app ouvre l'itinéraire vers le resto ouvert le plus proche.
private let faimURL = URL(string: "gfaim://?faim=1")!
// Passé ce délai, le verdict ne veut plus rien dire (on a bougé, le resto a fermé) : on repasse au « Touche-moi ».
private let verdictLifetime: TimeInterval = 3 * 60 * 60

struct Verdict: Decodable {
  let name: String
  let minutes: Double
  let mode: String
  let closing: String?
  let lang: String?
  let savedAt: Double?

  var savedDate: Date? { savedAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
}

// MARK: - Textes (fr / en / es), sans catalogue de chaînes : la langue vient de l'app, sinon de l'iPhone.

struct Words {
  let header: String
  let openUntil: String
  let hungryTitle: String
  let hungryCta: String
  let hungrySub: String
  let go: String
  let galleryDescription: String

  static func forLang(_ code: String?) -> Words {
    let lang = code ?? Locale.preferredLanguages.first.map { String($0.prefix(2)) } ?? "fr"
    switch lang {
    case "en":
      return Words(
        header: "Your belly picked",
        openUntil: "open until %@",
        hungryTitle: "Belly rumbling?",
        hungryCta: "Tap me.",
        hungrySub: "I'll find the closest place open right now.",
        go: "Go!",
        galleryDescription: "The closest open place, picked by your belly."
      )
    case "es":
      return Words(
        header: "Tu barriga eligió",
        openUntil: "abierto hasta las %@",
        hungryTitle: "¿Te ruge la barriga?",
        hungryCta: "Tócame.",
        hungrySub: "Te encuentro el sitio abierto más cercano.",
        go: "¡Vamos!",
        galleryDescription: "El sitio abierto más cercano, elegido por tu barriga."
      )
    default:
      return Words(
        header: "Ton ventre a choisi",
        openUntil: "ouvert jusqu'à %@",
        hungryTitle: "Ton ventre gargouille ?",
        hungryCta: "Touche-moi.",
        hungrySub: "Je te trouve le resto ouvert le plus proche.",
        go: "J'y vais !",
        galleryDescription: "Le resto ouvert le plus proche, choisi par ton ventre."
      )
    }
  }
}

// MARK: - Timeline

struct VerdictEntry: TimelineEntry {
  let date: Date
  let verdict: Verdict?
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> VerdictEntry {
    VerdictEntry(date: Date(), verdict: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (VerdictEntry) -> Void) {
    // Dans la galerie, on montre un exemple plutôt qu'un widget vide.
    let sample = Verdict(name: "La Capitale Tacos", minutes: 4, mode: "walk", closing: "23 h", lang: nil, savedAt: nil)
    completion(VerdictEntry(date: Date(), verdict: context.isPreview ? (loadVerdict() ?? sample) : loadVerdict()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<VerdictEntry>) -> Void) {
    let now = Date()
    guard let verdict = loadVerdict() else {
      completion(Timeline(entries: [VerdictEntry(date: now, verdict: nil)], policy: .never))
      return
    }
    let expiry = (verdict.savedDate ?? now).addingTimeInterval(verdictLifetime)
    if expiry <= now {
      completion(Timeline(entries: [VerdictEntry(date: now, verdict: nil)], policy: .never))
      return
    }
    // Le verdict maintenant, puis le « Touche-moi » quand il est périmé. L'app recharge à chaque recherche.
    completion(Timeline(
      entries: [VerdictEntry(date: now, verdict: verdict), VerdictEntry(date: expiry, verdict: nil)],
      policy: .never
    ))
  }

  private func loadVerdict() -> Verdict? {
    guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: verdictKey) else { return nil }
    return try? JSONDecoder().decode(Verdict.self, from: data)
  }
}

// MARK: - Vues

private extension Color {
  static let groublBg = Color("groublBg")
  static let groublInk = Color("groublInk")
  static let groublAccent = Color("groublAccent")
  static let groublMuted = Color("groublMuted")
}

struct VerdictLines: View {
  let verdict: Verdict
  let words: Words
  let nameLines: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(words.header.uppercased())
        .font(.system(size: 11, weight: .bold, design: .rounded))
        .tracking(0.6)
        .foregroundStyle(Color.groublAccent)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      Text("🍽️ \(verdict.name)")
        .font(.system(size: 18, weight: .bold, design: .serif))
        .foregroundStyle(Color.groublInk)
        .lineLimit(nameLines)
        .minimumScaleFactor(0.75)
      Spacer(minLength: 0)
      Text("\(verdict.mode == "drive" ? "🚗" : "🚶") \(Int(verdict.minutes.rounded())) min")
        .font(.system(size: 15, weight: .semibold, design: .rounded))
        .foregroundStyle(Color.groublInk)
      if let closing = verdict.closing {
        Text(String(format: words.openUntil, closing))
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(Color.groublMuted)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

struct HungryLines: View {
  let words: Words
  let showSub: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("😋")
        .font(.system(size: 30))
      Spacer(minLength: 0)
      Text(words.hungryTitle)
        .font(.system(size: 18, weight: .bold, design: .serif))
        .foregroundStyle(Color.groublInk)
        .lineLimit(2)
        .minimumScaleFactor(0.75)
      Text(words.hungryCta)
        .font(.system(size: 15, weight: .bold, design: .rounded))
        .foregroundStyle(Color.groublAccent)
      if showSub {
        Text(words.hungrySub)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(Color.groublMuted)
          .lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

// La pastille de droite du widget moyen : un gros bouton « J'y vais ! ».
struct GoBadge: View {
  let words: Words

  var body: some View {
    VStack(spacing: 6) {
      Text("🍽️")
        .font(.system(size: 34))
      Text(words.go)
        .font(.system(size: 14, weight: .heavy, design: .rounded))
        .foregroundStyle(Color.groublBg)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(Color.groublAccent))
    }
    .frame(width: 96)
  }
}

struct GroublWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: VerdictEntry

  var body: some View {
    let words = Words.forLang(entry.verdict?.lang)
    Group {
      if family == .systemMedium {
        HStack(spacing: 12) {
          if let verdict = entry.verdict {
            VerdictLines(verdict: verdict, words: words, nameLines: 2)
          } else {
            HungryLines(words: words, showSub: true)
          }
          GoBadge(words: words)
        }
      } else if let verdict = entry.verdict {
        VerdictLines(verdict: verdict, words: words, nameLines: 3)
      } else {
        HungryLines(words: words, showSub: false)
      }
    }
    .containerBackground(Color.groublBg, for: .widget)
    .widgetURL(faimURL)
  }
}

// MARK: - Widget

struct GroublWidget: Widget {
  let kind = "GroublWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      GroublWidgetView(entry: entry)
    }
    .configurationDisplayName("Groubl")
    .description(Words.forLang(nil).galleryDescription)
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct GroublWidgetBundle: WidgetBundle {
  var body: some Widget {
    GroublWidget()
  }
}
