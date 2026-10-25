/**
 * Prend les 5 captures de l'app sur le simulateur iOS, dans chaque langue, et les dépose dans raw/<langue>/
 * pour generate.mjs. Pilote l'app par l'argument de lancement -deeplink "cuisine=…&mode=surprise&sheet=2" :
 * le simulateur ne sait pas toucher l'écran, et un gfaim:// ouvre une demande de confirmation.
 *
 *   node capture.mjs [chemin/vers/Groubl.app] [fr en es]
 *
 * Prérequis : Xcode (xcrun simctl) et un build simulateur (eas build -p ios --profile simulator).
 * Les restos affichés dépendent de l'heure : à lancer quand Paris et Rennes sont à l'heure des repas.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

const BUNDLE = "com.jphilippelingrand.gfaim";
const args = process.argv.slice(2);
const APP = args.find((a) => a.endsWith(".app")) ?? new URL("../data/sim/Groubl.app", import.meta.url).pathname;
const LANGS = args.filter((a) => /^(fr|en|es)$/.test(a));
const LOCALES = { fr: "fr_FR", en: "en_US", es: "es_ES" };
const PLACES = { paris: [48.8795, 2.34], rennes: [48.1113, -1.6799] };
// Spécialité à mettre en avant sur la capture des cuisines (doit faire partie des 4 proposées à Rennes).
const CUISINE = "crepe";
// Le modèle dont les captures ont la taille obligatoire (1206 × 2622).
const DEVICE = "iPhone 17 Pro";

const sh = (...a) => execFileSync("xcrun", ["simctl", ...a], { encoding: "utf8" }).trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(APP)) throw new Error(`App simulateur introuvable : ${APP}`);

// Un simulateur dédié, recréé à chaque fois pour partir d'un état propre.
const types = JSON.parse(sh("list", "devicetypes", "-j")).devicetypes;
const type = types.find((t) => t.name === DEVICE) ?? types.filter((t) => /iPhone .* Pro$/.test(t.name)).at(-1);
// Le runtime le plus récent qui accepte ce modèle (iOS 27.1, par exemple, n'existe que pour l'iPhone Duo).
const runtime = JSON.parse(sh("list", "runtimes", "-j"))
  .runtimes.filter((r) => r.platform === "iOS" && r.isAvailable && r.supportedDeviceTypes?.some((d) => d.identifier === type.identifier))
  .at(-1);
console.log(`Simulateur : ${type.name}, ${runtime.name}`);

for (const lang of LANGS.length ? LANGS : Object.keys(LOCALES)) {
  const udid = sh("create", `Groubl captures ${lang}`, type.identifier, runtime.identifier);
  try {
    sh("boot", udid);
    sh("bootstatus", udid, "-b");
    sh("status_bar", udid, "override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100", "--cellularBars", "4", "--wifiBars", "3");
    sh("install", udid, APP);
    sh("privacy", udid, "grant", "location", BUNDLE);
    const out = new URL(`./raw/${lang}/`, import.meta.url).pathname;
    mkdirSync(out, { recursive: true });
    const shot = (name) => {
      sh("io", udid, "screenshot", "--type=png", out + name);
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

    // Paris : 1. la carte et ses 5 pastilles, 2. la liste (panneau ouvert en grand),
    // 4. le mode rapide, 5. le mode surprise. Chaque lancement relance la recherche.
    for (const [name, query] of [
      ["01-carte.png", ""],
      ["02-liste.png", "sheet=2"],
      ["04-rapide.png", "mode=fast"],
      ["05-surprise.png", "mode=surprise"],
    ]) {
      launch(PLACES.paris, query);
      await wait(10000);
      shot(name);
    }

    // 3. Une spécialité du coin : les crêpes à Rennes.
    launch(PLACES.rennes, `cuisine=${CUISINE}&sheet=1`);
    await wait(12000);
    shot("03-cuisines.png");
  } finally {
    try {
      sh("shutdown", udid);
    } catch {
      /* déjà éteint */
    }
    sh("delete", udid);
  }
}
console.log("Captures prêtes : lancer `node generate.mjs` pour produire les visuels.");
