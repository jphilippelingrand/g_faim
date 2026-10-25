/**
 * Visuels App Store de Groubl : une seule scène panoramique (trajet en pointillés, pastilles, la dame,
 * emojis à cheval sur les découpes) découpée en 5 captures, pour chaque langue et chaque taille d'écran,
 * plus l'en-tête de page produit (21:9) et l'image des résultats de recherche (3:2).
 *
 *   cd store && npm install && npm run build
 *
 * Vraies captures de l'app à déposer dans raw/<langue>/ (sinon : écran provisoire), noms ci-dessous.
 * Sortie : out/<langue>/<taille>/0N.png, out/<langue>/header.png, out/<langue>/search.png
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LADY = readFileSync(new URL("./assets/lady.svg", import.meta.url), "utf8");

// Tailles acceptées par App Store Connect (portrait), rendues en points × 3 pour tomber au pixel près.
const SIZES = {
  "iphone-6.3": { w: 402, h: 874 }, // 1206 × 2622 (obligatoire)
  "iphone-6.9": { w: 440, h: 956 }, // 1320 × 2868
  "duo-outer": { w: 466, h: 678 }, // 1398 × 2034
  "duo-inner": { w: 669, h: 951 }, // 2007 × 2853
};

// Une capture par diapositive, prise sur l'iPhone dans la langue concernée.
const RAW = ["01-recherche.png", "02-carte.png", "03-cuisines.png", "04-surprise.png", "05-liste.png"];

const TEXT = {
  fr: {
    tagline: "Les meilleures tables ouvertes, juste à côté.",
    slides: [
      ["Ton ventre gargouille ?", "Groubl trouve les meilleures tables ouvertes autour de toi."],
      ["Les 5 meilleures, là, maintenant", "Classées par note Google, uniquement celles qui sont ouvertes."],
      ["Les spécialités du coin", "Poutine, crêpes, basque… selon l'endroit où tu es."],
      ["Laisse le hasard choisir", "Le mode surprise tire 5 restos au pif."],
      ["Un tap, et c'est parti", "L'itinéraire s'ouvre en un geste."],
    ],
  },
  en: {
    tagline: "The best open tables, right around the corner.",
    slides: [
      ["Tummy rumbling?", "Groubl finds the best open restaurants around you."],
      ["The top 5, right here, right now", "Ranked by Google rating, open places only."],
      ["Local specialties", "Poutine, crêpes, Basque food… depending on where you are."],
      ["Let chance decide", "Surprise mode picks 5 restaurants at random."],
      ["One tap and you're off", "Directions open in a single tap."],
    ],
  },
  es: {
    tagline: "Las mejores mesas abiertas, a la vuelta de la esquina.",
    slides: [
      ["¿Te ruge la barriga?", "Groubl encuentra los mejores restaurantes abiertos cerca de ti."],
      ["Los 5 mejores, aquí y ahora", "Ordenados por nota de Google, solo los que están abiertos."],
      ["Especialidades locales", "Poutine, crepes, cocina vasca… según dónde estés."],
      ["Deja que el azar elija", "El modo sorpresa elige 5 restaurantes al azar."],
      ["Un toque y en marcha", "Cómo llegar, en un solo gesto."],
    ],
  },
};

const C = { bg: "#fbf6ef", peach: "#fde3da", ink: "#2b211c", muted: "#8a7b70", accent: "#e2583e", line: "#eadfd3" };
const FONTS =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,900&family=Inter:wght@500&display=swap";

/** Capture de l'app en data URL, ou null si elle n'a pas encore été déposée. */
function rawShot(lang, i) {
  for (const l of [lang, "fr"]) {
    const p = new URL(`./raw/${l}/${RAW[i]}`, import.meta.url);
    if (existsSync(p)) return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
  }
  return null;
}

/** Un iPhone (cadre sombre, écran arrondi) avec la capture, ou un écran provisoire. */
function phone(src, label, widthPx, rotate = 0) {
  const r = widthPx * 0.13;
  const screen = src
    ? `<img src="${src}" style="display:block;width:100%;border-radius:${r * 0.82}px">`
    : `<div style="aspect-ratio:1179/2556;border-radius:${r * 0.82}px;background:repeating-linear-gradient(135deg,#f3ece3 0 14px,#efe6db 14px 28px);display:grid;place-items:center;text-align:center;font:500 ${widthPx * 0.06}px Inter;color:${C.muted};padding:20px">Capture à venir<br>${label}</div>`;
  return `<div style="width:${widthPx}px;padding:${widthPx * 0.035}px;background:${C.ink};border-radius:${r}px;box-shadow:0 ${widthPx * 0.08}px ${widthPx * 0.2}px rgba(43,33,28,.28);transform:rotate(${rotate}deg)">${screen}</div>`;
}

/** Trajet en pointillés qui ondule sur toute la largeur, avec des pastilles numérotées sur les découpes. */
function route(W, H, n, y0, amp) {
  const pts = [];
  for (let x = 0; x <= W; x += W / 200) pts.push(`${x.toFixed(1)},${(y0 + Math.sin((x / W) * Math.PI * (n * 0.9)) * amp).toFixed(1)}`);
  const pinR = Math.min(W / n, H) * 0.06;
  const pins = Array.from({ length: n - 1 }, (_, i) => {
    const x = (i + 1) * (W / n);
    const y = y0 + Math.sin((x / W) * Math.PI * (n * 0.9)) * amp;
    return `<g transform="translate(${x},${y})"><circle r="${pinR}" fill="${C.accent}" stroke="#fff" stroke-width="${pinR * 0.22}"/><text text-anchor="middle" dy="${pinR * 0.36}" font-family="Fraunces" font-weight="900" font-size="${pinR * 1.05}" fill="#fff">${i + 1}</text></g>`;
  }).join("");
  return `<svg width="${W}" height="${H}" style="position:absolute;inset:0" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${pts.join(" ")}" fill="none" stroke="${C.accent}" stroke-width="${pinR * 0.28}" stroke-dasharray="${pinR * 0.6} ${pinR * 0.55}" stroke-linecap="round" opacity=".55"/>${pins}</svg>`;
}

const EMOJIS = ["🍟", "🍣", "🥞", "🍕", "🍜", "🌮"];

/** La scène panoramique complète : n diapositives côte à côte, de w × h points chacune. */
function panorama(lang, { w, h }) {
  const n = TEXT[lang].slides.length;
  const W = w * n;
  const phoneW = Math.min(w * 0.74, h * 0.36);
  const slides = TEXT[lang].slides
    .map(([title, sub], i) => {
      const first = i === 0;
      return `<section style="position:absolute;left:${i * w}px;top:0;width:${w}px;height:${h}px">
        <div style="position:absolute;top:${h * 0.055}px;left:${w * 0.08}px;right:${w * 0.08}px;text-align:center">
          <h1 style="margin:0;font:700 ${w * 0.088}px/1.05 Fraunces;letter-spacing:-.02em;color:${C.ink}">${title}</h1>
          <p style="margin:${h * 0.012}px 0 0;font:500 ${w * 0.04}px/1.35 Inter;color:${C.muted}">${sub}</p>
        </div>
        <div style="position:absolute;top:${h * 0.255}px;left:${first ? w * 0.3 : (w - phoneW) / 2}px">${phone(rawShot(lang, i), RAW[i], first ? phoneW * 0.8 : phoneW)}</div>
      </section>`;
    })
    .join("");
  // La dame, en grand, devant le premier téléphone, accoudée à son coin inférieur gauche.
  // Le dessin a beaucoup de marge autour de la dame : on l'agrandit en conséquence.
  const ladyW = w * 0.98;
  const lady = `<div style="position:absolute;left:${-w * 0.2}px;top:${h - ladyW * 0.9}px;width:${ladyW}px;z-index:2;filter:drop-shadow(0 ${w * 0.02}px ${w * 0.04}px rgba(43,33,28,.18))">${LADY.replace("<svg ", `<svg width="${ladyW}" height="${ladyW}" `)}</div>`;
  const emojis = Array.from({ length: n - 1 }, (_, i) => {
    const x = (i + 1) * w;
    const size = w * 0.16;
    return `<div style="position:absolute;left:${x - size / 2}px;top:${h * (i % 2 ? 0.86 : 0.2)}px;font-size:${size}px;transform:rotate(${i % 2 ? 12 : -14}deg);filter:drop-shadow(0 ${size * 0.06}px ${size * 0.12}px rgba(43,33,28,.18))">${EMOJIS[i % EMOJIS.length]}</div>`;
  }).join("");
  return `<!doctype html><html><head><link href="${FONTS}" rel="stylesheet"><style>
    html,body{margin:0;width:${W}px;height:${h}px;overflow:hidden}
    body{position:relative;background:linear-gradient(100deg,${C.bg} 0%,${C.peach} 30%,${C.bg} 55%,${C.peach} 80%,${C.bg} 100%)}
  </style></head><body>${route(W, h, n, h * 0.63, h * 0.06)}${slides}${lady}${emojis}</body></html>`;
}

/**
 * En-tête de page produit (21:9) ou image des résultats de recherche (3:2) : même univers, à plat.
 * Tailles calculées sur la largeur et contenu centré verticalement, pour que les deux formats tiennent.
 */
function banner(lang, { w, h }) {
  const order = [1, 0, 2];
  const pw = w * 0.12;
  const phones = order
    .map((i, k) => `<div style="position:absolute;top:${k === 1 ? 0 : pw * 0.25}px;left:${k * pw * 0.9}px;z-index:${k === 1 ? 3 : 2}">${phone(rawShot(lang, i), RAW[i], pw, (k - 1) * 8)}</div>`)
    .join("");
  const ladyW = w * 0.26;
  return `<!doctype html><html><head><link href="${FONTS}" rel="stylesheet"><style>
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
    body{position:relative;display:flex;align-items:center;justify-content:center;gap:${w * 0.03}px;
      background:linear-gradient(110deg,${C.bg} 0%,${C.peach} 60%,${C.bg} 100%)}
  </style></head><body>${route(w, h, 4, h * 0.5 + w * 0.135, w * 0.022)}
    <div style="position:relative;display:flex;align-items:center;gap:${w * 0.01}px">
      <div style="width:${ladyW}px;height:${ladyW}px">${LADY.replace("<svg ", `<svg width="${ladyW}" height="${ladyW}" `)}</div>
      <div style="max-width:${w * 0.3}px">
        <div style="font:900 ${w * 0.085}px/1 Fraunces;letter-spacing:-.03em;color:${C.ink}">Groubl</div>
        <div style="margin-top:${w * 0.012}px;font:500 ${w * 0.024}px/1.3 Inter;color:${C.muted}">${TEXT[lang].tagline}</div>
      </div>
    </div>
    <div style="position:relative;width:${pw * 2.9}px;height:${pw * 2.3}px">${phones}</div>
  </body></html>`;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
async function render(html, w, h, dpr, clips) {
  await page.setViewport({ width: Math.round(w), height: Math.round(h), deviceScaleFactor: dpr });
  await page.setContent(html, { waitUntil: "load", timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  for (const { path, x } of clips) {
    await page.screenshot({ path, type: "png", omitBackground: false, clip: { x, y: 0, width: w / clips.length, height: h } });
  }
}

const langs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TEXT);
for (const lang of langs) {
  for (const [name, size] of Object.entries(SIZES)) {
    const dir = new URL(`./out/${lang}/${name}/`, import.meta.url);
    mkdirSync(dir, { recursive: true });
    const n = TEXT[lang].slides.length;
    const clips = Array.from({ length: n }, (_, i) => ({ path: new URL(`0${i + 1}.png`, dir).pathname, x: i * size.w }));
    await render(panorama(lang, size), size.w * n, size.h, 3, clips);
  }
  const dir = new URL(`./out/${lang}/`, import.meta.url);
  // 3840 × 1646 et 3840 × 2560, rendus en points × 2.
  await render(banner(lang, { w: 1920, h: 823 }), 1920, 823, 2, [{ path: new URL("header.png", dir).pathname, x: 0 }]);
  await render(banner(lang, { w: 1920, h: 1280 }), 1920, 1280, 2, [{ path: new URL("search.png", dir).pathname, x: 0 }]);
  console.log(`${lang} : 4 tailles × 5 captures + en-tête + recherche`);
}
await browser.close();
