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

/** Story 540 × 960 (rendue × 2) : même signature, remontée au-dessus de la zone « Envoyer un message ». */
const storyPage = (lang, body, bg = C.bg) =>
  page(lang, body, bg)
    .replace("width:540px;height:675px", "width:540px;height:960px")
    .replace(".foot{position:absolute;left:0;right:0;bottom:0;", `.foot{position:absolute;left:60px;right:60px;bottom:96px;border:1px solid ${C.line};border-radius:999px;`);

/** Une fiche du paquet de cartes, comme sur le site (PlaceCard + SwipeDeck). */
const card = ({ name, info, min, stamp, style = "" }) => `<div style="position:relative;${style}">
  <div style="background:#fff;border:1px solid ${C.line};border-radius:20px;padding:22px 20px 20px;display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:end;box-shadow:0 12px 34px rgba(43,33,28,.12)">
    <div><div style="font:700 28px/1.1 Fraunces">${name}</div>
    <div style="font:400 14px/1.4 Inter;color:${C.muted};margin-top:8px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3f8f5a;margin-right:6px;vertical-align:1px"></span>${info}</div></div>
    <div style="text-align:right;color:${C.accent};line-height:1"><b style="display:block;font:700 50px/1 Fraunces">${min}</b><span style="font:500 13px Inter">min 🚶</span></div>
  </div>
  ${stamp ? `<span style="position:absolute;top:-22px;left:18px;background:#fff;padding:2px 12px;border:3px solid currentColor;border-radius:8px;font:900 30px Fraunces;letter-spacing:.04em;white-space:nowrap;${stamp.yum ? `color:${C.accent};transform:rotate(-12deg)` : `color:${C.muted};transform:rotate(12deg)`}">${stamp.text}</span>` : ""}
</div>`;

/** Les boutons ✕ / partager / ♥ sous le paquet. */
const roundBtns = `<div style="display:flex;justify-content:center;align-items:center;gap:18px">
  <div style="width:60px;height:60px;border-radius:50%;border:1px solid ${C.line};background:#fff;display:grid;place-items:center;font-size:24px;color:${C.muted};box-shadow:0 3px 10px rgba(43,33,28,.12)">✕</div>
  <div style="width:46px;height:46px;border-radius:50%;border:1px solid ${C.line};background:#fff;display:grid;place-items:center;box-shadow:0 3px 10px rgba(43,33,28,.12)"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <div style="width:68px;height:68px;border-radius:50%;background:${C.accent};display:grid;place-items:center;font-size:29px;color:#fff;box-shadow:0 3px 10px rgba(43,33,28,.12)">♥</div>
</div>`;

/** « C'est un match » : le paquet, la carte du taco qui part à droite, MIAM. */
const matchPost = (lang, L) =>
  page(
    lang,
    `<div style="position:absolute;inset:0 0 52px;background:radial-gradient(ellipse at 50% 40%,${C.peach} 0,${C.bg} 70%)"></div>
    <div style="position:absolute;inset:0 0 52px;display:flex;flex-direction:column;justify-content:center;padding-bottom:8px">
      <div style="text-align:center;font:600 12px Inter;letter-spacing:.14em;color:${C.accent}">${L.kicker}</div>
      <div style="margin:50px 58px 0;display:grid">
        <div style="grid-area:1/1;transform:scale(.94) translateY(14px);opacity:.7">${card({ name: L.behind[0], info: L.behind[1], min: L.behind[2] })}</div>
        <div style="grid-area:1/1;transform:translateX(26px) rotate(5deg)">${card({ name: L.top[0], info: L.top[1], min: L.top[2], stamp: { yum: true, text: L.yum } })}</div>
      </div>
      <div style="margin-top:34px">${roundBtns}</div>
      <div style="text-align:center;margin-top:46px">
        <div style="font:italic 900 64px/1 Fraunces;color:${C.accent};letter-spacing:-.02em">${L.title}</div>
        <div style="font:italic 400 20px/1.35 Fraunces;color:${C.ink};margin-top:14px">${L.sub}</div>
      </div>
    </div>`,
  );

/** Story « swiper à droite » : deux lignes, l'appli de rencontre puis Groubl. */
const swipeStory = (lang, L) => {
  const row = (swipe, result, extra) => `<div style="background:#fff;border:1px solid ${C.line};border-radius:24px;padding:24px 24px 26px;box-shadow:0 12px 34px rgba(43,33,28,.08)">
    <div style="font:500 16px Inter;color:${C.muted}">${swipe}</div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
      <div style="flex:none;width:44px;height:44px;border-radius:50%;background:${C.accent};color:#fff;display:grid;place-items:center;font-size:20px">♥</div>
      <div style="font:700 27px/1.15 Fraunces">${result}</div>
    </div>${extra}</div>`;
  const note = (t) => `<span style="font:italic 400 16px Fraunces;color:${C.muted}">${t}</span>`;
  return storyPage(
    lang,
    `<div style="padding:180px 40px 0">
      <div style="font:italic 900 46px/1.02 Fraunces;color:${C.ink};letter-spacing:-.02em">${L.title}<br><span style="color:${C.accent}">${L.title2}</span></div>
      <div style="margin-top:34px">${row(
        L.a,
        L.aRes,
        `<div style="display:flex;align-items:center;gap:10px;margin-top:16px">
          <span style="display:inline-block;background:#fff;border-radius:10px;padding:7px 12px;box-shadow:0 2px 10px rgba(43,33,28,.18);font:800 17px Inter;letter-spacing:.01em"><span style="background:linear-gradient(90deg,#f58529,#dd2a7b,#8134af);-webkit-background-clip:text;color:transparent">@BAR.DARLING</span></span>
          ${note(L.aNote)}
        </div>`,
      )}</div>
      <div style="margin-top:16px">${row(L.b, L.bRes, `<div style="margin-top:14px">${note(L.bNote)}</div>`)}</div>
      <div style="text-align:center;margin-top:30px;font:600 15px Inter;color:${C.ink}">${L.cta} <span style="color:${C.accent}">groubl.com</span></div>
    </div>`,
  );
};

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

  // Ticket de caisse de la pause du midi.
  n1: () => {
    const lines = [
      ["Ouvrir 3 applis", "4 min"],
      ["Lire des avis de 2019", "9 min"],
      ["« T'as envie de quoi ? »", "6 min"],
      ["Marcher jusqu'au resto", "7 min"],
      ["Constater qu'il est fermé", "1 min"],
      ["Manger", "11 min"],
    ];
    return page(
      "fr",
      `<div style="position:absolute;left:110px;right:110px;top:110px;background:#fff;padding:30px 26px 34px;box-shadow:0 14px 40px rgba(43,33,28,.1);font:400 13px/1.5 'Courier New',monospace;color:${C.ink};transform:rotate(-1.5deg);
        -webkit-mask:linear-gradient(#000 0 0) top/100% calc(100% - 10px) no-repeat,radial-gradient(circle at 6px 100%,transparent 5px,#000 5.5px) bottom/12px 10px repeat-x">
        <div style="text-align:center;font-weight:700;font-size:15px">PAUSE DU MIDI</div>
        <div style="text-align:center;color:${C.muted}">mardi · 12:00 · caisse 1</div>
        <div style="border-top:1px dashed ${C.muted};margin:14px 0 10px"></div>
        ${lines.map(([a, b]) => `<div style="display:flex;justify-content:space-between;gap:12px;margin:5px 0"><span>${a}</span><span style="white-space:nowrap">${b}</span></div>`).join("")}
        <div style="border-top:1px dashed ${C.muted};margin:12px 0 8px"></div>
        <div style="display:flex;justify-content:space-between;font-weight:700"><span>TOTAL</span><span>38 min</span></div>
        <div style="display:flex;justify-content:space-between;color:${C.muted}"><span>dont manger</span><span>29 %</span></div>
        <div style="border-top:1px dashed ${C.muted};margin:12px 0 10px"></div>
        <div style="text-align:center">MERCI DE VOTRE PATIENCE<br>À DEMAIN, MÊME HEURE</div>
      </div>`,
    );
  },

  // Alerte « batterie de patience » façon iPhone.
  n2: () =>
    page(
      "en",
      `<div style="position:absolute;inset:0 0 52px;display:grid;place-items:center">
        <div style="width:330px;background:rgba(255,255,255,.92);border-radius:22px;box-shadow:0 20px 60px rgba(43,33,28,.14);text-align:center;overflow:hidden">
          <div style="padding:26px 24px 20px">
            <svg width="64" height="30" viewBox="0 0 64 30" style="margin-bottom:12px"><rect x="1.5" y="1.5" width="54" height="27" rx="7" fill="none" stroke="${C.ink}" stroke-width="2.5"/><rect x="58" y="10" width="4" height="10" rx="2" fill="${C.ink}"/><rect x="6" y="6" width="5" height="18" rx="3" fill="${C.accent}"/></svg>
            <div style="font:600 17px Inter">Patience Low</div>
            <div style="font:400 14px/1.4 Inter;color:${C.muted};margin-top:6px">4% remaining. Low Patience Mode reduces small talk, politeness and willingness to walk more than 300 m until you eat.</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid ${C.line};font:500 16px Inter;color:${C.accent}">
            <div style="padding:14px;border-right:1px solid ${C.line}">Close</div><div style="padding:14px;font-weight:600">Find food</div>
          </div>
        </div>
      </div>`,
    ),

  // Notifications envoyées par le ventre.
  n3: () => {
    const notes = [
      ["maintenant", "Ok là on en parle."],
      ["il y a 6 min", "Je dis ça, je dis rien."],
      ["il y a 18 min", "Petite question : c'est prévu pour quand ?"],
      ["il y a 41 min", "🙂"],
    ];
    return page(
      "fr",
      `<div style="position:absolute;inset:0 0 52px;background:linear-gradient(160deg,#f6d9cc,#fbf6ef 60%)"></div>
      <div style="position:relative;text-align:center;padding-top:58px">
        <div style="font:500 16px Inter;color:${C.ink};opacity:.7">mardi 3 novembre</div>
        <div style="font:700 86px/1 Fraunces;letter-spacing:-.03em;margin-top:4px">12:07</div>
      </div>
      <div style="position:relative;padding:28px 34px 0">
        ${notes
          .map(
            ([t, txt], i) => `<div style="display:flex;gap:12px;align-items:flex-start;background:rgba(255,255,255,${0.9 - i * 0.12});border-radius:18px;padding:13px 15px;margin-top:9px;box-shadow:0 4px 18px rgba(43,33,28,.06);transform:scale(${1 - i * 0.025})">
            <div style="width:34px;height:34px;flex:none;border-radius:9px;background:${C.peach};display:grid;place-items:center;padding:3px">${LADY}</div>
            <div style="flex:1;text-align:left"><div style="display:flex;justify-content:space-between;font:600 13px Inter"><span>Ventre</span><span style="font-weight:400;color:${C.muted}">${t}</span></div>
            <div style="font:400 14px/1.35 Inter;margin-top:2px">${txt}</div></div></div>`,
          )
          .join("")}
      </div>`,
    );
  },

  // Diagramme de Venn : bon, ouvert, proche.
  n4: () =>
    page(
      "en",
      `<div style="padding:60px 40px 0;text-align:center">
        <div class="serif" style="font:700 32px/1.1 Fraunces;letter-spacing:-.01em">Where to eat, explained</div>
        <svg viewBox="0 0 460 420" width="460" height="420" style="margin-top:20px">
          ${[[150, 150, "#f6b8a6"], [310, 150, "#f9d58a"], [230, 285, "#c9dcc0"]].map(([x, y, f]) => `<circle cx="${x}" cy="${y}" r="110" fill="${f}" opacity=".6" style="mix-blend-mode:multiply"/>`).join("")}
          <g font-family="Fraunces" font-size="19" font-weight="700" fill="${C.ink}" text-anchor="middle">
            <text x="120" y="118">Good</text><text x="340" y="118">Open</text><text x="230" y="345">Close by</text>
          </g>
          <g font-family="Inter" font-size="12.5" fill="${C.muted}" text-anchor="middle">
            <text x="120" y="138">closed on Mondays</text><text x="340" y="138">the gas station</text><text x="230" y="365">“the place we don't talk about”</text>
          </g>
          <circle cx="230" cy="198" r="5" fill="${C.accent}"/>
          <path d="M236 203 C 330 260, 400 330, 430 392" fill="none" stroke="${C.accent}" stroke-width="1.5" stroke-dasharray="3 4"/>
          <text x="460" y="412" text-anchor="end" font-family="Fraunces" font-style="italic" font-size="15" fill="${C.ink}">you, at 12:15, need this</text>
        </svg>
      </div>`,
    ),

  // Invitation de calendrier refusée par le ventre.
  n5: () =>
    page(
      "fr",
      `<div style="padding:150px 46px 0">
        <div style="background:#fff;border-radius:20px;box-shadow:0 10px 40px rgba(43,33,28,.08);overflow:hidden">
          <div style="padding:22px 24px;border-left:6px solid ${C.accent}">
            <div style="font:600 12px Inter;letter-spacing:.1em;color:${C.muted}">INVITATION</div>
            <div class="serif" style="font:700 25px/1.15 Fraunces;margin-top:6px">Point rapide</div>
            <div style="font:400 15px Inter;color:${C.muted};margin-top:6px">Mardi · 11 h 45 – 13 h 15</div>
          </div>
          <div style="border-top:1px solid ${C.line};padding:16px 24px;font:400 14px/1.6 Inter">
            ${[
              ["Toi", "Accepté", "#3f8f5a"],
              ["Ton cerveau", "Peut-être", C.muted],
              ["Ton ventre", "Refusé", C.accent],
            ]
              .map(([who, s, col]) => `<div style="display:flex;justify-content:space-between"><span>${who}</span><span style="color:${col};font-weight:600">${s}</span></div>`)
              .join("")}
          </div>
          <div style="border-top:1px solid ${C.line};padding:16px 24px;background:${C.peach};font:400 14px/1.45 Inter">
            <div style="font:600 12px Inter;color:${C.muted};margin-bottom:4px">Message de Ton ventre</div>
            « Un point rapide de 90 minutes à cheval sur midi ? On va se le dire franchement : non. »
          </div>
        </div>
      </div>`,
    ),
  // Le nouveau site, façon appli de rencontre : un match avec un taco. Carrousel FR (t1) puis EN (t2).
  t1: () =>
    matchPost("fr", {
      kicker: "LE NOUVEAU GROUBL.COM",
      behind: ["Pho Bonheur", "🍜 Vietnamien · 450 m", 6],
      top: ["Taco Taco Taco", "jusqu'à 23 h · 🌮 Mexicain", 2],
      yum: "MIAM",
      title: "C'est un match.",
      sub: "Il est ouvert. Émotionnellement aussi.",
    }),
  t2: () =>
    matchPost("en", {
      kicker: "THE NEW GROUBL.COM",
      behind: ["Pho Bonheur", "🍜 Vietnamese · 450 m", 6],
      top: ["Taco Taco Taco", "until 11 PM · 🌮 Mexican", 2],
      yum: "YUM",
      title: "It's a match.",
      sub: "It's open. Emotionally, too.",
    }),

  // Story : à droite sur une appli de rencontre → un premier date au Darling ; à droite sur Groubl → on mange.
  // Le @bar.darling dessiné marque l'emplacement du vrai sticker « mention », à poser à la main dans Instagram.
  story1: () => swipeStory("fr", {
    title: "Swiper à droite,", title2: "mode d'emploi.",
    a: "Sur une app de rencontre", aRes: "Premier date au Darling.", aNote: "classique. on approuve.",
    b: "Sur Groubl", bRes: "Tu manges. Dans 2 min.", bNote: "Pas de small talk. Pas de ghosting.",
    cta: "Le nouveau site :",
  }),
  story1en: () => swipeStory("en", {
    title: "Swiping right,", title2: "a quick guide.",
    a: "On a dating app", aRes: "First date at Darling.", aNote: "a classic. we approve.",
    b: "On Groubl", bRes: "You eat. In 2 min.", bNote: "No small talk. No ghosting.",
    cta: "The new site:",
  }),
};

const only = process.argv.slice(2);
const out = new URL("./social/", import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const tab = await browser.newPage();
await tab.setViewport({ width: 540, height: 675, deviceScaleFactor: 2 });
for (const [id, html] of Object.entries(POSTS)) {
  if (only.length && !only.includes(id)) continue;
  await tab.setViewport({ width: 540, height: id.startsWith("story") ? 960 : 675, deviceScaleFactor: 2 });
  await tab.setContent(html(), { waitUntil: "load", timeout: 120000 });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: new URL(`${id}.png`, out).pathname, type: "png" });
  console.log(id);
}
await browser.close();
