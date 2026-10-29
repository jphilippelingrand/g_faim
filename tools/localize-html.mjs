/**
 * Après `vite build` : une page HTML par langue (dist/fr, dist/en, dist/es), avec titre, description et
 * aperçu de lien (Open Graph) traduits. Messenger & co lisent le HTML sans exécuter le JavaScript : sans
 * ces pages, l'aperçu serait le même pour toutes les langues.
 * La page racine (/) devient l'aiguillage : elle renvoie vers la langue mémorisée ou celle du navigateur.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SITE = "https://www.groubl.com";
const DIST = "dist";

const LANGS = {
  fr: {
    locale: "fr_FR",
    name: "Groubl",
    description: "Les 5 restos ouverts les plus proches.",
    imageAlt: "La petite dame de Groubl, le ventre qui gargouille",
  },
  en: {
    locale: "en_US",
    name: "Groubl",
    description: "The 5 closest places open right now.",
    imageAlt: "The little lady from Groubl, with a rumbling tummy",
  },
  es: {
    locale: "es_ES",
    name: "Groubl",
    description: "Los 5 restaurantes abiertos más cercanos.",
    imageAlt: "La señora de Groubl, con la barriga rugiendo",
  },
};

const source = readFileSync(`${DIST}/index.html`, "utf8");

/** Remplace le contenu d'une balise identifiée par son attribut ; échoue si la balise a disparu. */
function setAttr(html, selector, attr, value) {
  const re = new RegExp(`(<${selector}[^>]*\\s${attr}=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`Balise introuvable dans index.html : <${selector} ${attr}>`);
  return html.replace(re, `$1${value.replace(/"/g, "&quot;")}$2`);
}

const alternates = [
  ...Object.keys(LANGS).map((l) => `    <link rel="alternate" hreflang="${l}" href="${SITE}/${l}" />`),
  `    <link rel="alternate" hreflang="x-default" href="${SITE}/" />`,
].join("\n");

function localize(lang) {
  const t = LANGS[lang];
  let html = source.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${t.name}</title>`);
  html = setAttr(html, 'meta name="description"', "content", t.description);
  html = setAttr(html, 'meta name="apple-mobile-web-app-title"', "content", t.name);
  html = setAttr(html, 'link rel="manifest"', "href", `/manifest.${lang}.webmanifest`);
  html = setAttr(html, 'link rel="canonical"', "href", `${SITE}/${lang}`);
  html = setAttr(html, 'meta property="og:site_name"', "content", t.name);
  html = setAttr(html, 'meta property="og:url"', "content", `${SITE}/${lang}`);
  html = setAttr(html, 'meta property="og:title"', "content", t.name);
  html = setAttr(html, 'meta property="og:description"', "content", t.description);
  html = setAttr(html, 'meta property="og:image"', "content", `${SITE}/og-image-${lang}.png`);
  html = setAttr(html, 'meta property="og:image:alt"', "content", t.imageAlt);
  html = setAttr(html, 'meta property="og:locale"', "content", t.locale);
  html = html.replace(/\s*<meta property="og:locale:alternate"[^>]*>/g, "");
  const others = Object.entries(LANGS)
    .filter(([l]) => l !== lang)
    .map(([, o]) => `\n    <meta property="og:locale:alternate" content="${o.locale}" />`)
    .join("");
  html = html.replace(/(<meta property="og:locale"[^>]*>)/, `$1${others}`);
  return html.replace("</head>", `${alternates}\n  </head>`);
}

for (const lang of Object.keys(LANGS)) {
  mkdirSync(`${DIST}/${lang}`, { recursive: true });
  writeFileSync(`${DIST}/${lang}/index.html`, localize(lang));
}

// Racine : contenu français par défaut (aperçu de groubl.com), plus l'aiguillage vers la bonne langue,
// le plus tôt possible pour éviter un affichage dans la mauvaise langue.
const redirect = `    <script>
      (function () {
        // Seulement depuis / exactement : si un serveur renvoyait cette page sur /en, pas de boucle.
        if (location.pathname !== "/") return;
        var langs = ${JSON.stringify(Object.keys(LANGS))};
        var lang;
        try { lang = localStorage.getItem("jai-faim:lang"); } catch (e) {}
        if (langs.indexOf(lang) < 0) {
          lang = (navigator.languages || [navigator.language || ""])
            .map(function (l) { return l.slice(0, 2).toLowerCase(); })
            .filter(function (l) { return langs.indexOf(l) >= 0; })[0] || "fr";
        }
        location.replace("/" + lang + location.search + location.hash);
      })();
    </script>`;
writeFileSync(`${DIST}/index.html`, localize("fr").replace("<head>", `<head>\n${redirect}`).replace(
  `<link rel="canonical" href="${SITE}/fr" />`,
  `<link rel="canonical" href="${SITE}/" />`,
));

console.log(`Pages par langue : ${Object.keys(LANGS).map((l) => `/${l}`).join(", ")} (+ aiguillage sur /)`);
