/**
 * Reel « On mange où ? » (1080 × 1920, 30 i/s, 13 s, sans son) : le groupe de discussion qui tourne en rond,
 * puis le vote Groubl — on coche 3 restos, les copains swipent, le plus de ❤️ gagne — et la dame.
 *
 *   node social/reel-vote.mjs            (FR et EN)
 *   node social/reel-vote.mjs fr         (une seule langue)
 *   PREVIEW=1.5,4.5 PREVIEW_DIR=/tmp/x node social/reel-vote.mjs fr   (quelques images fixes, sans vidéo)
 *
 * Même principe que store/reel.mjs : Chrome rend chaque image (la scène est une fonction du temps), ffmpeg
 * assemble. Sortie : public/social/c3-reel-vote-<langue>.mp4 et -cover.png. Les restos sont inventés.
 */
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const LADY = readFileSync(new URL("../store/assets/lady.svg", import.meta.url), "utf8");
const ICON = `data:image/svg+xml;base64,${readFileSync(new URL("../public/icon.svg", import.meta.url)).toString("base64")}`;
const FONTS =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,700;1,9..144,900&family=Inter:wght@400;500;600&display=swap";

// 405 × 720 px CSS, rendue × 8/3 : 1080 × 1920.
const W = 405;
const H = 720;
const FPS = 30;
const DURATION = 13;
// La couverture : le classement, le gagnant bien visible.
const COVER_AT = 10.2;

const TEXT = {
  fr: {
    hooks: ["POV : le groupe,<br>22 h, toujours pas mangé.", "Coche 3 restos.<br>Envoie le lien.", "Tes potes swipent.<br>Même sans l'app.", "Le plus de ❤️ gagne.<br>Fin du débat."],
    group: "Les affamés 🍽️",
    chat: [
      ["Max", "on mange où ?"],
      ["Léa", "jsp"],
      ["Sam", "comme vous voulez"],
      ["Max", "pas encore des sushis 🙄"],
      ["Léa", "thaï ?"],
      ["Sam", "j'ai mangé thaï hier"],
      ["Max", "allô ?"],
      ["Léa", "on décide quand là ??"],
    ],
    title: "On mange où ?",
    howTo: "Coche 2 à 5 restos : tes copains swipent, le groupe décide.",
    places: [
      ["Pizza Nonna Rita", "🍕 Pizza · 120 m"],
      ["Pho Minuit", "🍜 Vietnamien · 180 m"],
      ["Taco Loco", "🌮 Mexicain · 210 m"],
      ["Le Grilled Cheese", "🥪 Sandwichs · 260 m"],
      ["Curry Express", "🍛 Indien · 300 m"],
    ],
    // Les cases cochées, dans l'ordre (indices dans places).
    picks: [0, 1, 2],
    send: "Envoyer le vote",
    voteSub: "Swipe ❤️ ou ✕ · encore 58 min",
    step: "Resto {n} sur 3",
    nope: "NAN",
    yum: "MIAM",
    voted: "{name} a voté",
    winner: "Le groupe a choisi Pho Minuit 🏆 On y va !",
    standings: [["🏆 Pho Minuit", 3], ["Pizza Nonna Rita", 2], ["Taco Loco", 1]],
    go: "Y aller",
    tagline: "Le groupe décide.<br>Pas le chat.",
    cta: "Bouton 🧑‍🤝‍🧑 sur le site<br>Bêta iPhone : DM « BÊTA »",
  },
  en: {
    hooks: ["POV: the group chat,<br>10 p.m., still hungry.", "Pick 3 places.<br>Send the link.", "Your friends swipe.<br>No app needed.", "Most ❤️ wins.<br>End of debate."],
    group: "The hungry ones 🍽️",
    chat: [
      ["Max", "where do we eat?"],
      ["Lea", "idk"],
      ["Sam", "whatever you want"],
      ["Max", "not sushi again 🙄"],
      ["Lea", "thai?"],
      ["Sam", "had thai yesterday"],
      ["Max", "hello??"],
      ["Lea", "can we decide??"],
    ],
    title: "Where should we eat?",
    howTo: "Pick 2 to 5 places: your friends swipe, the group decides.",
    places: [
      ["Pizza Nonna Rita", "🍕 Pizza · 120 m"],
      ["Pho Midnight", "🍜 Vietnamese · 180 m"],
      ["Taco Loco", "🌮 Mexican · 210 m"],
      ["The Grilled Cheese", "🥪 Sandwiches · 260 m"],
      ["Curry Express", "🍛 Indian · 300 m"],
    ],
    picks: [0, 1, 2],
    send: "Send the vote",
    voteSub: "Swipe ❤️ or ✕ · 58 min left",
    step: "Place {n} of 3",
    nope: "NOPE",
    yum: "YUM",
    voted: "{name} voted",
    winner: "The group picked Pho Midnight 🏆 Let's go!",
    standings: [["🏆 Pho Midnight", 3], ["Pizza Nonna Rita", 2], ["Taco Loco", 1]],
    go: "Go",
    tagline: "The group decides.<br>Not the chat.",
    cta: "🧑‍🤝‍🧑 button on the site<br>iPhone beta: DM “BETA”",
  },
};

// Le minutage (en secondes) : la discussion, la feuille du vote, les swipes, le classement, la fin.
const T = { sheet: 3.1, swipe: 5.9, results: 8.9, end: 10.9 };
// Chaque message de la discussion arrive à ce rythme.
const BUBBLE_EVERY = 0.34;
// Les taps sur les cases, puis sur « Envoyer ».
const TAPS = [3.6, 4.1, 4.6];
const SEND_AT = 5.2;
// Les swipes du vote : [début, lâché, sortie, direction]. ✕, ❤️, ✕ : ce copain aussi veut Pho (3 ❤️ sur 3).
const SWIPES = [[6.1, 6.55, 6.8, -1], [6.95, 7.4, 7.65, 1], [7.8, 8.25, 8.5, -1]];

const page = (lang) => {
  const L = TEXT[lang];
  const voters = L.chat.slice(0, 3).map(([name]) => name);
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}">
<style>
  :root { --bg:#fbf6ef; --card:#fff; --ink:#2b211c; --muted:#8a7b70; --accent:#e2583e; --accent-soft:#fde3da; --line:#eadfd3; }
  * { box-sizing:border-box }
  body { margin:0; width:${W}px; height:${H}px; overflow:hidden; position:relative; background:var(--bg); color:var(--ink); font:16px/1.5 Inter, system-ui, sans-serif }
  .layer { position:absolute; inset:0; opacity:0 }
  .hook { position:absolute; left:0; right:0; top:46px; text-align:center; z-index:5 }
  .hook span { display:inline-block; padding:10px 18px; border-radius:18px; background:rgb(251 246 239 / .96); box-shadow:0 4px 18px rgb(43 33 28 / .14); font:italic 900 1.4rem/1.15 Fraunces; letter-spacing:-.01em }

  /* La discussion de groupe (façon messagerie, sans copier aucune appli). */
  #chat { background:#f1ece6 }
  .chat-head { position:absolute; top:136px; left:0; right:0; text-align:center; font:600 .85rem Inter; color:var(--muted) }
  /* Les plus anciens sortent par le haut, comme dans une vraie discussion. */
  .bubbles { position:absolute; left:16px; right:16px; top:166px; bottom:40px; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end; gap:6px }
  .bubble { align-self:flex-start; max-width:78%; padding:6px 12px; border-radius:18px 18px 18px 6px; background:#fff; box-shadow:0 1px 2px rgb(43 33 28 / .08); font-size:.92rem; line-height:1.35; opacity:0 }
  .bubble small { display:block; font:600 .68rem Inter; color:var(--accent); margin-bottom:1px }
  .bubble.me { align-self:flex-end; border-radius:18px 18px 6px 18px; background:var(--accent); color:#fff }
  .bubble.me small { color:#ffe3da }
  #typing { align-self:flex-start; padding:10px 16px; border-radius:18px; background:#fff; font-size:1.2rem; letter-spacing:3px; color:var(--muted); opacity:0 }

  /* La feuille « On mange où ? ». */
  #sheet { background:var(--bg); padding:150px 18px 0 }
  .title { font:italic 900 1.9rem/1.05 Fraunces; letter-spacing:-.02em; margin:0 }
  .sub { color:var(--muted); font-size:.85rem; line-height:1.4; margin:6px 0 6px }
  .row { display:flex; align-items:center; gap:12px; padding:9px 0; border-bottom:1px solid var(--line) }
  .check { width:24px; height:24px; border-radius:7px; border:2px solid var(--line); background:var(--card); display:grid; place-items:center; color:#fff; font:700 .9rem Fraunces; flex:none }
  .check.on { background:var(--accent); border-color:var(--accent) }
  .row b { display:block; font:700 1rem Fraunces }
  .row span { font-size:.75rem; color:var(--muted) }
  .send { margin-top:16px; background:var(--accent); color:#fff; border-radius:999px; padding:12px; text-align:center; font:700 1rem Fraunces; opacity:.4 }

  /* La page de vote. */
  #vote { padding:150px 20px 0; text-align:center }
  .voters { display:flex; justify-content:center; gap:6px; margin:4px 0 12px; min-height:26px }
  .voter { padding:3px 10px; border-radius:999px; background:var(--accent-soft); color:var(--accent); font:600 .75rem Inter; opacity:0 }
  .step { font-size:.75rem; color:var(--muted); margin:0 0 8px }
  .cards { position:relative; display:grid }
  .vcard { grid-area:1/1; position:relative; min-height:170px; padding:22px 16px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--card); border:2px solid var(--accent); border-radius:20px; box-shadow:0 6px 18px rgb(226 88 62 / .14) }
  .vcard p { margin:0; font-size:.85rem; color:var(--muted) }
  .vcard h2 { margin:8px 0 0; font:700 1.6rem/1.1 Fraunces }
  .stamp { position:absolute; top:14px; padding:0 9px; border:3px solid currentColor; border-radius:8px; background:var(--card); font:700 1.3rem Fraunces; letter-spacing:.04em; opacity:0 }
  .stamp.nope { right:16px; color:var(--muted); transform:rotate(12deg) }
  .stamp.yum { left:16px; color:var(--accent); transform:rotate(-12deg) }
  .actions { display:flex; justify-content:center; gap:64px; margin-top:16px }
  .round { width:58px; height:58px; border-radius:50%; border:1px solid var(--line); background:var(--card); display:grid; place-items:center; font-size:1.4rem; color:var(--muted); box-shadow:0 3px 10px rgb(43 33 28 / .12) }
  .round.heart { width:66px; height:66px; background:var(--accent); border-color:var(--accent); color:#fff; font-size:1.7rem }

  /* Le classement. */
  #results { padding:150px 20px 0 }
  .kicker { font:italic 700 1.05rem/1.3 Fraunces; text-align:center; margin:4px 0 14px }
  .res { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:11px 14px; margin-bottom:10px }
  .res.top { border:2px solid var(--accent) }
  .res-head { display:flex; justify-content:space-between; font:700 1rem Fraunces }
  .res-head span { font:400 .85rem Inter }
  .bar { height:8px; margin-top:8px; background:var(--accent-soft); border-radius:99px; overflow:hidden }
  .bar div { height:100%; width:0; background:var(--accent); border-radius:99px }
  .go { display:inline-block; margin-top:10px; padding:8px 20px; border-radius:99px; background:var(--accent); color:#fff; font:700 .95rem Fraunces }

  .brand { position:absolute; top:668px; left:0; right:0; justify-content:center; display:flex; align-items:center; gap:6px; font:700 1rem Fraunces; z-index:4 }
  .brand img { width:24px; height:24px; border-radius:50% }
  #finger { position:absolute; width:44px; height:44px; margin:-22px 0 0 -22px; border-radius:50%; background:rgb(255 255 255 / .55); border:2px solid rgb(43 33 28 / .25); box-shadow:0 4px 14px rgb(43 33 28 / .2); opacity:0; z-index:6 }

  /* La fin. */
  #end { background:var(--bg); display:flex; flex-direction:column; align-items:center; text-align:center; padding-top:120px; z-index:8 }
  #end .lady { width:200px; height:200px }
  #end .q { font:italic 900 2.2rem/1 Fraunces; letter-spacing:-.02em; color:var(--accent); margin-top:6px }
  #end .tag { font:italic 900 1.5rem/1.15 Fraunces; letter-spacing:-.01em; margin-top:14px }
  #end .url { font:700 2.5rem Fraunces; color:var(--accent); margin-top:14px; letter-spacing:-.01em }
  #end .cta { font:500 .9rem/1.5 Inter; color:var(--muted); margin-top:10px }
  body.cover #finger { display:none }
</style></head><body>
  <div class="hook"><span id="hook">${L.hooks[0]}</span></div>

  <div class="layer" id="chat">
    <div class="chat-head">${L.group}</div>
    <div class="bubbles">
      ${L.chat.map(([who, msg], i) => `<div class="bubble${who === "Max" ? " me" : ""}" id="b${i}"><small>${who}</small>${msg}</div>`).join("")}
      <div id="typing">•••</div>
    </div>
  </div>

  <div class="layer" id="sheet">
    <p class="title">${L.title}</p>
    <p class="sub">${L.howTo}</p>
    ${L.places.map(([name, info], i) => `<div class="row"><div class="check" id="k${i}"></div><div><b>${name}</b><span>${info}</span></div></div>`).join("")}
    <div class="send" id="send">${L.send} (<span id="count">0</span>)</div>
  </div>

  <div class="layer" id="vote">
    <p class="title">${L.title}</p>
    <p class="sub">${L.voteSub}</p>
    <div class="voters">${voters.map((name, i) => `<span class="voter" id="v${i}">✓ ${L.voted.replace("{name}", name)}</span>`).join("")}</div>
    <p class="step" id="step"></p>
    <div class="cards">
      ${L.picks
        .map((p, i) => `<div class="vcard" id="c${i}"><p>${L.places[p][1].split(" · ")[0]}</p><h2>${L.places[p][0]}</h2><span class="stamp nope">${L.nope}</span><span class="stamp yum">${L.yum}</span></div>`)
        .reverse()
        .join("")}
    </div>
    <div class="actions"><div class="round" id="bx">✕</div><div class="round heart" id="bh">♥</div></div>
  </div>

  <div class="layer" id="results">
    <p class="title" style="text-align:center">${L.title}</p>
    <p class="kicker">${L.winner}</p>
    ${L.standings
      .map(([name, hearts], i) => `<div class="res${i ? "" : " top"}"><div class="res-head">${name}<span>❤️ ${hearts}</span></div><div class="bar"><div id="r${i}"></div></div>${i ? "" : `<div class="go">${L.go}</div>`}</div>`)
      .join("")}
  </div>

  <div class="brand" id="brand"><img src="${ICON}" alt="">Groubl</div>
  <div id="finger"></div>

  <div class="layer" id="end">
    <div class="lady">${LADY}</div>
    <div class="q">${L.title}</div>
    <div class="tag">${L.tagline}</div>
    <div class="url">groubl.com</div>
    <div class="cta">${L.cta}</div>
  </div>
<script>
  const HOOKS = ${JSON.stringify(L.hooks)}, STEP = ${JSON.stringify(L.step)};
  const T = ${JSON.stringify(T)}, TAPS = ${JSON.stringify(TAPS)}, SEND_AT = ${SEND_AT}, SWIPES = ${JSON.stringify(SWIPES)};
  const BUBBLE_EVERY = ${BUBBLE_EVERY}, BUBBLES = ${L.chat.length}, PICKS = ${JSON.stringify(L.picks)};
  const MAX_HEARTS = ${Math.max(...L.standings.map(([, h]) => h))}, HEARTS = ${JSON.stringify(L.standings.map(([, h]) => h))};
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const easeOut = (p) => 1 - (1 - p) ** 3;
  const easeInOut = (p) => (p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
  const $ = (id) => document.getElementById(id);
  // Un fondu enchaîné de 0,25 s entre deux scènes.
  const shown = (t, a, b) => Math.min(prog(t, a, a + .25), 1 - prog(t, b, b + .25));
  const finger = (x, y, o, press) => {
    const f = $("finger");
    f.style.left = x + "px"; f.style.top = y + "px"; f.style.opacity = o;
    f.style.transform = press ? "scale(.82)" : "none";
  };

  window.render = (t) => {
    $("chat").style.opacity = 1 - prog(t, T.sheet, T.sheet + .25);
    $("sheet").style.opacity = shown(t, T.sheet, T.swipe);
    $("vote").style.opacity = shown(t, T.swipe, T.results);
    $("results").style.opacity = shown(t, T.results, T.end);
    $("end").style.opacity = easeOut(prog(t, T.end, T.end + .35));
    $("brand").style.opacity = t > T.sheet ? 1 : 0;
    $("hook").innerHTML = HOOKS[t < T.sheet ? 0 : t < T.swipe ? 1 : t < T.results ? 2 : 3];
    $("hook").parentElement.style.opacity = 1 - prog(t, T.end, T.end + .2);
    finger(0, 0, 0);

    // La discussion : un message après l'autre, qui remonte ; « ••• » à la fin, personne ne tranche.
    for (let i = 0; i < BUBBLES; i++) {
      const p = easeOut(prog(t, .25 + i * BUBBLE_EVERY, .25 + i * BUBBLE_EVERY + .18));
      const b = $("b" + i);
      b.style.opacity = p;
      b.style.transform = \`translateY(\${(1 - p) * 14}px) scale(\${.9 + .1 * p})\`;
      b.style.display = p > 0 ? "block" : "none";
    }
    const typingAt = .25 + BUBBLES * BUBBLE_EVERY;
    $("typing").style.opacity = t > typingAt ? .5 + .5 * Math.sin(t * 9) ** 2 : 0;

    // La feuille : trois cases cochées au doigt, puis « Envoyer ».
    let checked = 0;
    PICKS.forEach((p, i) => {
      const on = t >= TAPS[i];
      $("k" + p).classList.toggle("on", on);
      $("k" + p).textContent = on ? "✓" : "";
      if (on) checked++;
    });
    $("count").textContent = checked;
    $("send").style.opacity = checked >= 2 ? 1 : .4;
    $("send").style.transform = t > SEND_AT && t < SEND_AT + .2 ? "scale(.96)" : "none";
    if (t > T.sheet + .2 && t < T.swipe) {
      const row = (p) => { const r = $("k" + p).getBoundingClientRect(); return [r.left + 12, r.top + 12]; };
      const targets = [...PICKS.map(row), (() => { const r = $("send").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()];
      const times = [...TAPS, SEND_AT];
      let k = times.findIndex((at) => t < at + .15);
      if (k < 0) k = times.length - 1;
      const [x0, y0] = k ? targets[k - 1] : [${W} - 60, ${H} - 80];
      const [x1, y1] = targets[k];
      const m = easeInOut(prog(t, (k ? times[k - 1] : T.sheet + .2) + .15, times[k]));
      finger(x0 + (x1 - x0) * m, y0 + (y1 - y0) * m, Math.min(prog(t, T.sheet + .2, T.sheet + .4), 1 - prog(t, SEND_AT + .2, SEND_AT + .4)), Math.abs(t - times[k]) < .08);
    }

    // Le vote : à chaque carte, un copain de plus a voté.
    let current = SWIPES.findIndex(([, , out]) => t < out);
    if (current < 0) current = SWIPES.length;
    $("step").textContent = STEP.replace("{n}", Math.min(current + 1, SWIPES.length));
    SWIPES.forEach(([a, b, out, dir], i) => {
      const el = $("c" + i);
      let offset = 0, scale = 1, y = 0, opacity = 1;
      if (i < current) opacity = 0;
      else if (i === current) {
        offset = t >= b ? dir * (90 + easeOut(prog(t, b, out)) * ${W}) : dir * 90 * easeInOut(prog(t, a, b));
        if (t > a - .15 && t < b + .05) finger(${W} / 2 - 90 * dir + offset, 330, Math.min(prog(t, a - .15, a), 1 - prog(t, b, b + .05)));
      } else if (i === current + 1) {
        const p = current >= 0 && current < SWIPES.length ? easeOut(prog(t, SWIPES[current][1], SWIPES[current][2])) : 0;
        scale = .95 + .05 * p; y = 8 * (1 - p); opacity = .7 + .3 * p;
      } else opacity = 0;
      el.style.transform = \`translate(\${offset}px, \${y}px) rotate(\${offset / 18}deg) scale(\${scale})\`;
      el.style.opacity = opacity;
      el.querySelector(".nope").style.opacity = clamp(-offset / 70);
      el.querySelector(".yum").style.opacity = clamp(offset / 70);
    });
    SWIPES.forEach(([, b, out], i) => {
      const p = easeOut(prog(t, out, out + .2));
      $("v" + i).style.opacity = p;
      $("v" + i).style.display = p > 0 ? "inline-block" : "none";
      $("v" + i).style.transform = \`scale(\${.7 + .3 * p})\`;
    });
    const pressed = (dir) => SWIPES.some(([, b, out, d]) => d === dir && t > b && t < out);
    $("bx").style.transform = pressed(-1) ? "scale(.92)" : "none";
    $("bh").style.transform = pressed(1) ? "scale(.92)" : "none";

    // Le classement : les barres poussent, le gagnant d'abord.
    HEARTS.forEach((h, i) => {
      const p = easeOut(prog(t, T.results + .3 + i * .15, T.results + 1 + i * .15));
      $("r" + i).style.width = (p * h / MAX_HEARTS) * 100 + "%";
    });
  };
</script>
</body></html>`;
};

const PREVIEW = process.env.PREVIEW?.split(",").map(Number);
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ["fr", "en"];
const out = new URL("../public/social/", import.meta.url).pathname;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000 });
for (const lang of langs) {
  const tab = await browser.newPage();
  await tab.setViewport({ width: W, height: H, deviceScaleFactor: 1080 / W });
  await tab.setContent(page(lang), { waitUntil: "load", timeout: 120000 });
  await tab.evaluate(() => document.fonts.ready);
  if (PREVIEW) {
    for (const t of PREVIEW) {
      await tab.evaluate((t, cover) => { document.body.classList.toggle("cover", cover); window.render(t); }, t, t === COVER_AT);
      await tab.screenshot({ path: join(process.env.PREVIEW_DIR ?? tmpdir(), `vote-${lang}-${t}.png`), type: "png" });
    }
    await tab.close();
    continue;
  }
  const frames = join(tmpdir(), `groubl-reel-vote-${lang}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames);
  const total = Math.round(DURATION * FPS);
  for (let f = 0; f < total; f++) {
    await tab.evaluate((t) => window.render(t), f / FPS);
    await tab.screenshot({ path: join(frames, `${String(f).padStart(4, "0")}.jpg`), type: "jpeg", quality: 92 });
    if (f % 60 === 0) console.log(`${lang} ${f}/${total}`);
  }
  await tab.evaluate((t) => { document.body.classList.add("cover"); window.render(t); }, COVER_AT);
  await tab.screenshot({ path: `${out}c3-reel-vote-${lang}-cover.png`, type: "png" });
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%04d.jpg"), "-c:v", "libx264", "-profile:v", "high", "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-color_range", "tv", "-crf", "18", "-r", String(FPS), "-movflags", "+faststart", `${out}c3-reel-vote-${lang}.mp4`]);
  rmSync(frames, { recursive: true, force: true });
  await tab.close();
  console.log(`public/social/c3-reel-vote-${lang}.mp4`);
}
await browser.close();
