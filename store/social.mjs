/**
 * Visuels Instagram de Groubl (1080 × 1350) : série « faim ordinaire », humour discret, en français ou en anglais.
 * La dame n'apparaît qu'en signature, en bas ; la blague tient dans le visuel lui-même.
 *
 *   cd store && node social.mjs            (tous)
 *   cd store && node social.mjs s1 s3      (certains)
 *
 * Sortie : social/<id>.png, à copier dans public/social/ une fois la série validée.
 */
import { mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LADY = readFileSync(new URL("./assets/lady.svg", import.meta.url), "utf8");
const C = { bg: "#fbf6ef", peach: "#fde3da", ink: "#2b211c", muted: "#8a7b70", accent: "#e2583e", line: "#eadfd3" };
const FONTS =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,700&family=Inter:wght@400;500;600&display=swap";

const FOOTER = { fr: "Bientôt sur iPhone · groubl.com", en: "Coming soon to iPhone · groubl.com" };

/** Page 540 × 675 (rendue × 2), fond crème, signature en bas. */
const page = (lang, body, bg = C.bg) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}">
<style>
  *{box-sizing:border-box} body{margin:0;width:540px;height:675px;background:${bg};color:${C.ink};font-family:Inter;position:relative;overflow:hidden}
  .serif{font-family:Fraunces} .foot{position:absolute;left:0;right:0;bottom:0;height:52px;border-top:1px solid ${C.line};display:flex;align-items:center;justify-content:center;gap:8px;font:500 13px Inter;color:${C.muted};background:${bg}}
  .foot svg{width:24px;height:24px} .foot b{color:${C.ink};font-weight:600}
</style></head><body>${body}
<div class="foot">${LADY}<b>Groubl</b> · ${FOOTER[lang]}</div></body></html>`;

const POSTS = {
  // Historique de recherche qui se dégrade à mesure que la faim monte.
  s1: () =>
    page(
      "en",
      `<div style="padding:116px 44px 0">
        <div style="font:500 14px Inter;color:${C.muted};margin:0 0 14px 6px">Tuesday, 11:52 a.m.</div>
        <div style="background:#fff;border-radius:26px;box-shadow:0 10px 40px rgba(43,33,28,.08);overflow:hidden">
          <div style="display:flex;align-items:center;gap:12px;padding:20px 22px;border-bottom:1px solid ${C.line};font:500 17px Inter">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${C.muted}" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
            <span style="color:${C.ink}">restaurants open n</span><span style="width:2px;height:20px;background:${C.accent}"></span>
          </div>
          ${[
            "lunch spots near me",
            "lunch spots near me open now",
            "lunch spots near me open now actually open",
            "is it rude to leave a meeting for a sandwich",
            "how many calories in a pen cap",
            "restaurants near me open now please",
          ]
            .map(
              (q, i) => `<div style="display:flex;align-items:center;gap:14px;padding:16px 22px;${i ? `border-top:1px solid ${C.line};` : ""}font:400 16px/1.3 Inter;color:${C.ink}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${C.muted}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${q}</div>`,
            )
            .join("")}
        </div>
      </div>`,
    ),

  // Graphique : la distance qu'on accepte de marcher s'effondre avec la faim.
  s2: () => {
    const pts = [
      [0, 40],
      [1, 52],
      [2, 92],
      [3, 190],
      [3.6, 272],
      [4, 300],
    ];
    const X = (t) => 70 + t * 90;
    const path = pts.map(([t, y], i) => `${i ? "L" : "M"}${X(t)} ${y + 40}`).join(" ");
    // [t, y, texte, ancrage, décalage vertical] : au-dessus à droite, ou en dessous à gauche sous la courbe.
    const labels = [
      [0, 40, "« même à Laval, pas de souci »", "start", -12],
      [2, 92, "« pas plus loin que le métro »", "start", -12],
      [3, 190, "« au coin de la rue, max »", "end", 26],
      [4, 300, "la machine à chips du 3ᵉ", "end", 26],
    ];
    return page(
      "fr",
      `<div style="padding:54px 40px 0">
        <div class="serif" style="font:700 30px/1.1 Fraunces;letter-spacing:-.01em">Distance que je suis prêt·e<br>à marcher pour manger</div>
        <div style="font:400 14px Inter;color:${C.muted};margin-top:8px">Étude sur un échantillon de 1 (moi), un mardi.</div>
        <svg viewBox="0 0 460 430" width="460" height="430" style="margin-top:18px;overflow:visible">
          <g stroke="${C.line}" stroke-width="1">${[0, 1, 2, 3, 4].map((t) => `<line x1="${X(t)}" y1="30" x2="${X(t)}" y2="390"/>`).join("")}</g>
          <line x1="70" y1="390" x2="${X(4) + 20}" y2="390" stroke="${C.ink}" stroke-width="1.5"/>
          <line x1="70" y1="30" x2="70" y2="390" stroke="${C.ink}" stroke-width="1.5"/>
          <path d="${path}" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          ${labels
            .map(
              ([t, y, s, a, dy]) => `<circle cx="${X(t)}" cy="${y + 40}" r="6" fill="${C.accent}"/>
              <text x="${X(t) + (a === "end" ? -14 : 12)}" y="${y + 40 + dy}" text-anchor="${a}" font-family="Fraunces" font-style="italic" font-size="15" fill="${C.ink}">${s}</text>`,
            )
            .join("")}
          ${["9 h", "10 h", "11 h", "12 h", "13 h"].map((h, i) => `<text x="${X(i)}" y="412" text-anchor="middle" font-family="Inter" font-size="13" fill="${C.muted}">${h}</text>`).join("")}
          <text x="58" y="210" text-anchor="middle" font-family="Inter" font-size="12" fill="${C.muted}" transform="rotate(-90 58 210)">distance acceptable</text>
        </svg>
      </div>`,
    );
  },

  // Cartel de musée sous une assiette vide.
  s3: () =>
    page(
      "fr",
      `<div style="position:absolute;inset:0 0 52px;background:radial-gradient(ellipse at 50% 30%,#fff 0,#f4ede4 70%)"></div>
      <svg viewBox="0 0 300 300" width="300" height="300" style="position:absolute;left:120px;top:70px;filter:drop-shadow(0 18px 24px rgba(43,33,28,.14))">
        <circle cx="150" cy="150" r="140" fill="#fff" stroke="${C.line}" stroke-width="2"/>
        <circle cx="150" cy="150" r="98" fill="#fcfaf7" stroke="${C.line}" stroke-width="1.5"/>
        <path d="M108 190 q30 12 70 -6" fill="none" stroke="#e9b48a" stroke-width="3" stroke-linecap="round" opacity=".55"/>
        <g fill="#d9a77a"><circle cx="122" cy="132" r="2.6"/><circle cx="170" cy="118" r="2"/><circle cx="182" cy="168" r="2.4"/><circle cx="136" cy="170" r="1.8"/></g>
      </svg>
      <div style="position:absolute;left:150px;right:150px;top:418px;background:#fff;padding:18px 20px;box-shadow:0 2px 10px rgba(43,33,28,.08);font:400 12.5px/1.5 Inter;color:${C.ink}">
        <div style="font:700 15px Fraunces">Sans titre (assiette vide)</div>
        <div style="color:${C.muted}">Anonyme, 2026</div>
        <div style="color:${C.muted};margin-bottom:8px">Faïence, miettes, satisfaction</div>
        Réalisée un mardi midi, à 4 minutes à pied du bureau. L'artiste dit avoir trouvé le restaurant « en dix secondes ». Il n'en reste rien.
      </div>`,
    ),

  // Bulletin météo du ventre.
  s4: () => {
    const rows = [
      ["9 AM", "☀️", "Calm", "Coffee holding strong."],
      ["11 AM", "⛅", "Light rumbling", "Easily blamed on the radiator."],
      ["12 PM", "⛈️", "Growl warning", "Audible from two desks away."],
      ["12:40 PM", "🌪️", "Hangry advisory", "Avoid important emails."],
    ];
    return page(
      "en",
      `<div style="padding:92px 40px 0">
        <div style="font:600 12px Inter;letter-spacing:.14em;color:${C.accent}">STOMACH FORECAST · MONTRÉAL</div>
        <div class="serif" style="font:700 34px/1.05 Fraunces;margin-top:8px;letter-spacing:-.01em">Today, around lunch</div>
        <div style="margin-top:26px;background:#fff;border-radius:22px;box-shadow:0 10px 40px rgba(43,33,28,.08);overflow:hidden">
          ${rows
            .map(
              ([t, e, s, d], i) => `<div style="display:grid;grid-template-columns:82px 46px 1fr;align-items:center;padding:17px 20px;${i ? `border-top:1px solid ${C.line};` : ""}${i === 3 ? `background:${C.peach};` : ""}">
              <div style="font:600 14px Inter;color:${C.muted}">${t}</div><div style="font-size:28px">${e}</div>
              <div><div style="font:700 17px Fraunces">${s}</div><div style="font:400 13px Inter;color:${C.muted}">${d}</div></div></div>`,
            )
            .join("")}
        </div>
        <div style="margin-top:18px;font:italic 400 15px Fraunces;color:${C.muted};text-align:center">Advisory ends shortly after eating.</div>
      </div>`,
    );
  },

  // Conversation de groupe qui ne décide jamais.
  s5: () => {
    const msgs = [
      ["Julie", "on mange où ?", 0],
      ["Max", "chu pas difficile", 0],
      ["Sarah", "n'importe quoi sauf sushis", 0],
      ["Max", "ni pizza", 0],
      ["Max", "ni rien de trop loin", 0],
      ["Julie", "ok donc ?", 0],
      ["", "on fait comme hier ?", 1],
      ["Sarah", "on a rien mangé hier", 0],
    ];
    return page(
      "fr",
      `<div style="padding:26px 40px 0">
        <div style="text-align:center;margin-bottom:8px">
          <div style="width:38px;height:38px;border-radius:50%;background:${C.peach};margin:0 auto;display:grid;place-items:center;font-size:19px">🍽️</div>
          <div style="font:600 14px Inter;margin-top:4px">Le dîner</div><div style="font:400 12px Inter;color:${C.muted}">4 personnes · 11:48</div>
        </div>
        ${msgs
          .map(
            ([who, txt, me], i) => `<div style="display:flex;flex-direction:column;align-items:${me ? "flex-end" : "flex-start"};margin-top:${who && who === msgs[i - 1]?.[0] ? 3 : 6}px">
            ${who && who !== msgs[i - 1]?.[0] ? `<div style="font:500 11px Inter;color:${C.muted};margin:0 0 2px 12px">${who}</div>` : ""}
            <div style="max-width:72%;padding:8px 14px;border-radius:18px;font:400 15px/1.3 Inter;${me ? `background:${C.accent};color:#fff` : "background:#fff;box-shadow:0 1px 3px rgba(43,33,28,.08)"}">${txt}</div></div>`,
          )
          .join("")}
        <div style="text-align:center;font:500 12px Inter;color:${C.muted};margin-top:12px">13:52</div>
        <div style="display:flex;flex-direction:column;align-items:flex-start;margin-top:2px">
          <div style="font:500 11px Inter;color:${C.muted};margin:0 0 2px 12px">Max</div>
          <div style="padding:9px 14px;border-radius:18px;font:400 15px Inter;background:#fff;box-shadow:0 1px 3px rgba(43,33,28,.08)">bon ben souper alors</div>
        </div>
      </div>`,
    );
  },
};

const only = process.argv.slice(2);
const out = new URL("./social/", import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const tab = await browser.newPage();
await tab.setViewport({ width: 540, height: 675, deviceScaleFactor: 2 });
for (const [id, html] of Object.entries(POSTS)) {
  if (only.length && !only.includes(id)) continue;
  await tab.setContent(html(), { waitUntil: "load", timeout: 120000 });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: new URL(`${id}.png`, out).pathname, type: "png" });
  console.log(id);
}
await browser.close();
