/**
 * Prend les 5 captures de l'app sur le simulateur iOS, dans chaque langue, et les dépose dans raw/<langue>/
 * pour generate.mjs. Pilote l'app par l'argument de lancement -deeplink "card=2" (carte du paquet à montrer) :
 * le simulateur ne sait pas toucher ni glisser, et un gfaim:// ouvre une demande de confirmation.
 *
 *   node capture.mjs [chemin/vers/Groubl.app] [fr en es] [--duo | --iphone]   (un seul des deux modèles)
 *
 * Prérequis : Xcode (xcrun simctl) et un build simulateur (eas build -p ios --profile simulator).
 * Les restos affichés dépendent de l'heure : on prend des quartiers de Montréal animés tard le soir.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

const BUNDLE = "com.jphilippelingrand.gfaim";
const args = process.argv.slice(2);
const APP = args.find((a) => a.endsWith(".app")) ?? new URL("../data/sim/Groubl.app", import.meta.url).pathname;
const LANGS = args.filter((a) => /^(fr|en|es)$/.test(a));
const LOCALES = { fr: "fr_FR", en: "en_US", es: "es_ES" };
const PLACES = {
  centreVille: [45.5088, -73.5617],
  plateau: [45.5235, -73.5815],
  mileEnd: [45.5246, -73.5996],
  quartierLatin: [45.5155, -73.5615],
  vieuxPort: [45.5075, -73.5545],
};
// Le modèle dont les captures ont la taille obligatoire (1206 × 2622), puis l'iPhone Duo, dont les captures
// vont dans raw/<langue>/duo/ pour ses tailles d'App Store. Le simulateur du Duo démarre plié et simctl ne sait
// pas le déplier : on photographie l'écran extérieur (écran 1, 1398 × 2034).
const DEVICES = [
  { name: "iPhone 17 Pro", dir: "" },
  { name: "iPhone Duo", dir: "duo/", display: "1" },
].filter((d) => (args.includes("--duo") ? d.dir : args.includes("--iphone") ? !d.dir : true));

const sh = (...a) => execFileSync("xcrun", ["simctl", ...a], { encoding: "utf8" }).trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(APP)) throw new Error(`App simulateur introuvable : ${APP}`);

for (const device of DEVICES) {
  // Un simulateur dédié, recréé à chaque fois pour partir d'un état propre.
  const types = JSON.parse(sh("list", "devicetypes", "-j")).devicetypes;
  const type = types.find((t) => t.name === device.name);
  if (!type) throw new Error(`Simulateur introuvable : ${device.name}`);
  // Le runtime le plus récent qui accepte ce modèle (iOS 27.1, par exemple, n'existe que pour l'iPhone Duo).
  const runtime = JSON.parse(sh("list", "runtimes", "-j"))
    .runtimes.filter((r) => r.platform === "iOS" && r.isAvailable && r.supportedDeviceTypes?.some((d) => d.identifier === type.identifier))
    .at(-1);
  console.log(`Simulateur : ${type.name}, ${runtime.name}`);

  for (const lang of LANGS.length ? LANGS : Object.keys(LOCALES)) {
    const udid = sh("create", `Groubl captures ${device.name} ${lang}`, type.identifier, runtime.identifier);
    try {
      sh("boot", udid);
      sh("bootstatus", udid, "-b");
      sh("status_bar", udid, "override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100", "--cellularBars", "4", "--wifiBars", "3");
      sh("install", udid, APP);
      sh("privacy", udid, "grant", "location", BUNDLE);
      const out = new URL(`./raw/${lang}/${device.dir}`, import.meta.url).pathname;
      mkdirSync(out, { recursive: true });
      const shot = (name) => {
        sh("io", udid, "screenshot", "--type=png", ...(device.display ? [`--display=${device.display}`] : []), out + name);
        console.log(`  ${lang}/${name}`);
      };
      const launch = ([lat, lng], query = "") => {
        sh("location", udid, "set", `${lat},${lng}`);
        try {
          sh("terminate", udid, BUNDLE);
        } catch {
          /* l'app ne tournait pas encore */
        }
        sh("launch", udid, BUNDLE, "-AppleLanguages", `(${lang})`, "-AppleLocale", LOCALES[lang], ...(query ? ["-deeplink", query] : []));
      };

      // Chaque lancement relance la recherche autour de la position simulée.
      for (const [name, place, query] of [
        ["01-proche.png", PLACES.centreVille, ""],
        ["02-suivant.png", PLACES.plateau, "card=1"],
        ["03-ouvert.png", PLACES.mileEnd, ""],
        ["04-nuit.png", PLACES.quartierLatin, "card=2"],
        ["05-ailleurs.png", PLACES.vieuxPort, ""],
      ]) {
        launch(place, query);
        await wait(20000);
        shot(name);
      }
    } finally {
      try {
        sh("shutdown", udid);
      } catch {
        /* déjà éteint */
      }
      sh("delete", udid);
    }
  }
}
console.log("Captures prêtes : lancer `node generate.mjs` pour produire les visuels.");
