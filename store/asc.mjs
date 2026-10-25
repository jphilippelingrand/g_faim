/**
 * Met à jour la fiche App Store de Groubl via l'API App Store Connect :
 * version, build, textes (FR/EN/ES), captures d'écran.
 *
 *   ASC_KEY_PATH=~/.appstoreconnect/AuthKey_XXXX.p8 ASC_KEY_ID=XXXX ASC_ISSUER_ID=… \
 *     node asc.mjs [--apply] [--build 12] [--skip-screenshots]
 *
 * Sans --apply : n'écrit rien, affiche ce qui serait fait. Textes lus dans ../app/store.config.json,
 * images dans out/<langue>/<taille>/0N.png (voir generate.mjs). Rien n'est soumis à la vérification d'Apple.
 */
import { createHash, createSign } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";

const APPLY = process.argv.includes("--apply");
// Pour n'envoyer que la version, le build et les textes (ex. tant que les captures sont provisoires).
const SKIP_SCREENSHOTS = process.argv.includes("--skip-screenshots");
// Pour ne toucher que certaines langues : --locales en-AU,en-CA
const ONLY = process.argv.includes("--locales") ? process.argv[process.argv.indexOf("--locales") + 1].split(",") : null;
const BUILD = process.argv.includes("--build") ? process.argv[process.argv.indexOf("--build") + 1] : null;
const BUNDLE_ID = "com.jphilippelingrand.gfaim";
// Numéro de version par défaut de l'app (app.config.ts : APP_VERSION || "x.y.z").
const VERSION = readFileSync(new URL("../app/app.config.ts", import.meta.url), "utf8").match(/\|\| "([\d.]+)"/)?.[1] ?? "1.0.0";
const STORE = JSON.parse(readFileSync(new URL("../app/store.config.json", import.meta.url), "utf8")).apple;

// Dossier généré → type d'écran de l'API. L'API n'a pas (encore) de type iPhone Duo : ces captures-là
// se déposent à la main sur le site d'App Store Connect.
const DISPLAY_TYPES = { "iphone-6.9": "APP_IPHONE_67", "iphone-6.3": "APP_IPHONE_61" };
const LOCALE_DIRS = { "fr-FR": "fr", "en-US": "en", "en-AU": "en", "en-CA": "en", "es-ES": "es" };
// Langues de la fiche sans textes à elles : celles de la langue indiquée.
const SAME_AS = { "en-AU": "en-US", "en-CA": "en-US" };
const INFO = Object.fromEntries(
  [...Object.entries(STORE.info), ...Object.entries(SAME_AS).map(([l, src]) => [l, STORE.info[src]])].filter(([l]) => !ONLY || ONLY.includes(l)),
);

// ---------------------------------------------------------------- API

function token() {
  const path = (process.env.ASC_KEY_PATH ?? "").replace(/^~/, homedir());
  const kid = process.env.ASC_KEY_ID;
  const iss = process.env.ASC_ISSUER_ID;
  if (!existsSync(path) || !kid || !iss) {
    throw new Error("ASC_KEY_PATH (fichier .p8), ASC_KEY_ID et ASC_ISSUER_ID sont requis.");
  }
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "ES256", kid, typ: "JWT" })}.${b64({ iss, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" })}`;
  const sig = createSign("SHA256").update(body).sign({ key: readFileSync(path), dsaEncoding: "ieee-p1363" });
  return `${body}.${sig.toString("base64url")}`;
}

const JWT = token();

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (json.errors ?? []).map((e) => `${e.title} — ${e.detail}`).join(" | ");
    throw new Error(`${method} ${path} → ${res.status} ${detail}`);
  }
  return json;
}

/** En mode simulation, on décrit l'écriture au lieu de la faire. */
async function write(label, method, path, body) {
  if (!APPLY) {
    console.log(`  [simulation] ${label}`);
    return null;
  }
  console.log(`  ${label}`);
  return api(method, path, body);
}

// ---------------------------------------------------------------- Étapes

const { data: [app] } = await api("GET", `/v1/apps?filter[bundleId]=${BUNDLE_ID}`);
if (!app) throw new Error(`App ${BUNDLE_ID} introuvable dans App Store Connect.`);
console.log(`App : ${app.attributes.name} (${app.id})${APPLY ? "" : " — SIMULATION, rien ne sera modifié"}`);

// 1. Version en préparation, renommée au numéro des builds.
const { data: versions } = await api("GET", `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`);
const version = versions.find((v) => ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"].includes(v.attributes.appStoreState ?? v.attributes.appVersionState));
if (!version) throw new Error("Aucune version modifiable (en préparation) trouvée.");
console.log(`\nVersion : ${version.attributes.versionString} → ${VERSION}`);
if (STORE.copyright && version.attributes.copyright !== STORE.copyright) {
  await write(`copyright « ${STORE.copyright} »`, "PATCH", `/v1/appStoreVersions/${version.id}`, {
    data: { type: "appStoreVersions", id: version.id, attributes: { copyright: STORE.copyright } },
  });
}
if (version.attributes.versionString !== VERSION) {
  await write(`renommer en ${VERSION}`, "PATCH", `/v1/appStoreVersions/${version.id}`, {
    data: { type: "appStoreVersions", id: version.id, attributes: { versionString: VERSION } },
  });
}

// 2. Build rattaché (le plus récent de cette version, ou celui demandé).
const { data: builds } = await api(
  "GET",
  `/v1/builds?filter[app]=${app.id}&filter[preReleaseVersion.version]=${VERSION}&sort=-uploadedDate&limit=10${BUILD ? `&filter[version]=${BUILD}` : ""}`,
);
const build = builds.find((b) => b.attributes.processingState === "VALID");
console.log(`Build : ${build ? `n° ${build.attributes.version} (${build.attributes.processingState})` : "aucun build traité pour cette version"}`);
if (build) {
  await write(`rattacher le build ${build.attributes.version}`, "PATCH", `/v1/appStoreVersions/${version.id}/relationships/build`, {
    data: { type: "builds", id: build.id },
  });
}

// 3. Textes : nom, sous-titre et confidentialité (appInfo), puis description etc. (version).
const { data: infos } = await api("GET", `/v1/apps/${app.id}/appInfos`);
const appInfo = infos.find((i) => (i.attributes.appStoreState ?? i.attributes.state) !== "READY_FOR_SALE") ?? infos[0];
const { data: infoLocs } = await api("GET", `/v1/appInfos/${appInfo.id}/appInfoLocalizations`);
const { data: versionLocs } = await api("GET", `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);

const localizationIds = {};
for (const [locale, t] of Object.entries(INFO)) {
  console.log(`\n${locale}`);
  const infoAttrs = { name: t.title, subtitle: t.subtitle, privacyPolicyUrl: t.privacyPolicyUrl };
  const infoLoc = infoLocs.find((l) => l.attributes.locale === locale);
  if (infoLoc) {
    await write("nom, sous-titre, confidentialité", "PATCH", `/v1/appInfoLocalizations/${infoLoc.id}`, {
      data: { type: "appInfoLocalizations", id: infoLoc.id, attributes: infoAttrs },
    });
  } else {
    await write("créer : nom, sous-titre, confidentialité", "POST", "/v1/appInfoLocalizations", {
      data: {
        type: "appInfoLocalizations",
        attributes: { locale, ...infoAttrs },
        relationships: { appInfo: { data: { type: "appInfos", id: appInfo.id } } },
      },
    });
  }

  const versionAttrs = {
    description: t.description,
    keywords: t.keywords.join(","),
    promotionalText: t.promoText,
    supportUrl: t.supportUrl,
    marketingUrl: t.marketingUrl,
  };
  let versionLoc = versionLocs.find((l) => l.attributes.locale === locale);
  if (versionLoc) {
    await write("description, mots-clés, texte promotionnel, liens", "PATCH", `/v1/appStoreVersionLocalizations/${versionLoc.id}`, {
      data: { type: "appStoreVersionLocalizations", id: versionLoc.id, attributes: versionAttrs },
    });
  } else {
    const created = await write("créer : description, mots-clés, texte promotionnel, liens", "POST", "/v1/appStoreVersionLocalizations", {
      data: {
        type: "appStoreVersionLocalizations",
        attributes: { locale, ...versionAttrs },
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: version.id } } },
      },
    });
    versionLoc = created?.data;
  }
  localizationIds[locale] = versionLoc?.id;
}

// 4. Captures : chaque jeu (langue × type d'écran) est remplacé par les images générées.
async function uploadScreenshot(setId, file) {
  const bytes = readFileSync(file);
  const name = file.split("/").pop();
  const { data: shot } = await api("POST", "/v1/appScreenshots", {
    data: {
      type: "appScreenshots",
      attributes: { fileName: name, fileSize: bytes.length },
      relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } } },
    },
  });
  for (const op of shot.attributes.uploadOperations) {
    const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`Envoi de ${name} → ${res.status}`);
  }
  await api("PATCH", `/v1/appScreenshots/${shot.id}`, {
    data: {
      type: "appScreenshots",
      id: shot.id,
      attributes: { uploaded: true, sourceFileChecksum: createHash("md5").update(bytes).digest("hex") },
    },
  });
}

console.log(`\nCaptures${SKIP_SCREENSHOTS ? " : ignorées (--skip-screenshots)" : ""}`);
for (const [locale, dir] of SKIP_SCREENSHOTS ? [] : Object.entries(LOCALE_DIRS).filter(([l]) => l in INFO)) {
  for (const [folder, displayType] of Object.entries(DISPLAY_TYPES)) {
    const path = new URL(`./out/${dir}/${folder}/`, import.meta.url).pathname;
    if (!existsSync(path)) continue;
    const files = readdirSync(path).filter((f) => f.endsWith(".png")).sort().map((f) => path + f);
    const locId = localizationIds[locale];
    console.log(`  ${locale} ${displayType} : ${files.length} images (${(files.reduce((s, f) => s + statSync(f).size, 0) / 1e6).toFixed(1)} Mo)`);
    if (!APPLY || !locId) continue;
    const { data: sets } = await api("GET", `/v1/appStoreVersionLocalizations/${locId}/appScreenshotSets`);
    let set = sets.find((s) => s.attributes.screenshotDisplayType === displayType);
    if (set) {
      const { data: old } = await api("GET", `/v1/appScreenshotSets/${set.id}/appScreenshots`);
      for (const s of old) await api("DELETE", `/v1/appScreenshots/${s.id}`);
    } else {
      ({ data: set } = await api("POST", "/v1/appScreenshotSets", {
        data: {
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: displayType },
          relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: locId } } },
        },
      }));
    }
    for (const f of files) await uploadScreenshot(set.id, f);
  }
}

console.log(APPLY ? "\nTerminé. Rien n'a été soumis à la vérification d'Apple." : "\nSimulation terminée. Relance avec --apply pour envoyer.");
