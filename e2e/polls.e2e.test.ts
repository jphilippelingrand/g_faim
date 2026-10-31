/**
 * Les sondages « On mange où ? » de bout en bout : un serveur de dev du site (API comprise, sondages en
 * mémoire), le « user app » joué par le vrai code réseau de l'app (app/src/lib/pollsApi.ts), le « user web »
 * par Chrome (puppeteer), chaque copain dans sa propre fenêtre privée. Les notifications push partent vers
 * un faux service d'Expo, qui les garde pour qu'on les relise.
 *
 *   npm run test:e2e
 *
 * L'interface de l'app elle-même (React Native) n'est pas pilotée ici : il faudrait un simulateur iOS.
 * Chrome : CHROME_PATH, sinon celui de /Applications.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import puppeteer, { type Browser, type BrowserContext, type Page } from "puppeteer-core";
import { createServer, type ViteDevServer } from "vite";
import {
  apiCreatePoll,
  apiDelete,
  apiResults,
  apiVote,
  pollIdFrom,
  resultShareText,
  winner,
  type PollLive,
  type PollPlace,
} from "../app/src/lib/pollsApi.ts";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Montréal : les restos du site sont dans public/places.
const HOME = { latitude: 45.5231, longitude: -73.5817 };
const PLACES: PollPlace[] = [
  { name: "La Banquise", cuisine: "poutine", address: "994 Rue Rachel E, Montréal", lat: 45.5253, lng: -73.5749 },
  { name: "Ramen Misoya", cuisine: "ramen", lat: 45.5101, lng: -73.5651 },
  { name: "Pizzeria Geppetto", cuisine: "pizza", lat: 45.5202, lng: -73.5801 },
];
const SHARE_TEXTS = { won: "Le groupe a choisi {name} 🏆", open: "On mange où ?" };

let server: ViteDevServer;
let base: string;
let browser: Browser;
// Le faux service de push : chaque notification reçue.
type Push = { to: string; title: string; body: string; data: { url: string } };
let pushes: Push[] = [];
let pushServer: Server;

before(async () => {
  pushServer = createHttpServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      pushes.push(JSON.parse(body));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data: { status: "ok" } }));
    });
  });
  await new Promise<void>((resolve) => pushServer.listen(0, "127.0.0.1", resolve));
  process.env.PUSH_URL = `http://127.0.0.1:${(pushServer.address() as AddressInfo).port}`;
  server = await createServer({ configFile: "vite.config.ts", logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  // 127.0.0.1 est un « contexte sûr » pour Chrome : presse-papiers et compagnie y marchent comme en HTTPS.
  base = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
});

after(async () => {
  await browser?.close();
  await server?.close();
  pushServer?.close();
});

/** Un copain : sa propre fenêtre privée (donc son propre identifiant de votant), sans feuille de partage. */
async function friend(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.createBrowserContext();
  await context.overridePermissions(base, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write", "geolocation"]);
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844 });
  // Chrome sur Mac a navigator.share : on le retire pour passer par le presse-papiers, qu'on peut relire.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(Navigator.prototype, "share", { value: undefined });
  });
  return { context, page };
}

/** Swipe chaque carte avec les boutons ❤️ / ✕, puis attend le classement. */
async function voteOnPage(page: Page, likes: boolean[]) {
  for (const like of likes) {
    await page.waitForSelector(".vote-card");
    const step = await page.$eval(".vote-step", (el) => el.textContent);
    await page.click(like ? ".vote-heart" : ".vote-round:not(.vote-heart)");
    // La carte suivante (ou le classement) remplace celle-ci.
    await page.waitForFunction((before) => document.querySelector(".vote-step")?.textContent !== before, {}, step);
  }
  await page.waitForSelector(".vote-results");
}

/** Le classement affiché : nom (sans 🏆) → nombre de ❤️, et le nombre de votes annoncé. */
async function standings(page: Page): Promise<{ hearts: Record<string, number>; kicker: string; trophy: string | null }> {
  return page.$eval(".vote-results", (el) => {
    const hearts: Record<string, number> = {};
    let trophy: string | null = null;
    for (const row of el.querySelectorAll(".vote-row")) {
      const raw = row.querySelector(".vote-row-name")!.textContent!;
      const name = raw.replace("🏆 ", "");
      if (raw.startsWith("🏆")) trophy = name;
      hearts[name] = Number(row.querySelector(".vote-row-hearts")!.textContent!.replace(/\D/g, ""));
    }
    return { hearts, kicker: el.querySelector(".vote-kicker")!.textContent!, trophy };
  });
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const live = (r: Awaited<ReturnType<typeof apiResults>>): PollLive => {
  assert.notEqual(r, "expired", "le sondage devrait exister");
  return r as PollLive;
};

describe("Sondage lancé depuis l'app", () => {
  let id: string;
  let url: string;
  let owner: string;

  test("user app crée un sondage", async () => {
    const created = await apiCreatePoll(base, PLACES, "1h", "fr");
    ({ id, url, owner } = created);
    assert.match(id, /^[A-Za-z0-9]{8}$/);
    assert.equal(url, `${base}/v/${id}`);
    assert.ok(owner.length >= 20, "la clé de suppression est longue");
    assert.ok(created.expiresAt - Date.now() > 59 * 60_000, "ouvert une heure");
    const results = live(await apiResults(base, id));
    assert.deepEqual(results.hearts, [0, 0, 0]);
    assert.equal(results.voters, 0);
    // La clé ne circule jamais dans ce que voient les votants.
    assert.ok(!(await (await fetch(`${base}/api/polls/${id}`)).text()).includes(owner));
  });

  test("user app récupère le lien : il s'ouvre sur la page de vote", async () => {
    assert.equal(pollIdFrom(url), id);
    const { context, page } = await friend();
    await page.goto(url);
    await page.waitForSelector(".vote-card");
    assert.equal(await page.$eval(".vote-name", (el) => el.textContent), "La Banquise");
    // Pas lancé depuis ce navigateur : pas de quoi le supprimer.
    assert.equal(await page.$(".vote-owner"), null);
    await context.close();
  });

  test("user web vote, user app regarde les résultats", async () => {
    for (const likes of [
      [true, false, true],
      [true, true, false],
    ]) {
      const { context, page } = await friend();
      await page.goto(url);
      await voteOnPage(page, likes);
      await context.close();
    }
    const results = live(await apiResults(base, id));
    assert.equal(results.voters, 2);
    assert.deepEqual(results.hearts, [2, 1, 1]);
    assert.equal(winner(results)?.name, "La Banquise");
  });

  test("user app vote puis change d'avis : son vote est remplacé, pas ajouté", async () => {
    let results = live(await apiVote(base, id, "app-iphone", [false, true, false]));
    assert.equal(results.voters, 3);
    assert.deepEqual(results.hearts, [2, 2, 1]);
    assert.deepEqual(results.mine, [false, true, false]);
    assert.equal(winner(results), null, "égalité : pas encore de gagnant");

    results = live(await apiVote(base, id, "app-iphone", [false, false, true]));
    assert.equal(results.voters, 3);
    assert.deepEqual(results.hearts, [2, 1, 2]);
    // L'app relit son vote pour le montrer.
    assert.deepEqual(live(await apiResults(base, id, "app-iphone")).mine, [false, false, true]);
  });

  test("user app partage le résultat", async () => {
    const tied = live(await apiResults(base, id));
    assert.equal(resultShareText(tied, url, SHARE_TEXTS), `On mange où ? ${url}`, "égalité : on invite encore à voter");
    const results = live(await apiVote(base, id, "app-iphone", [true, false, false]));
    assert.equal(resultShareText(results, url, SHARE_TEXTS), `Le groupe a choisi La Banquise 🏆 ${url}`);
  });

  test("user app supprime le sondage : il disparaît pour tout le monde", async () => {
    await assert.rejects(apiDelete(base, id, "pas-la-bonne-cle"), /403/, "sans la clé, refusé");
    assert.notEqual(await apiResults(base, id), "expired");
    await apiDelete(base, id, owner);
    assert.equal(await apiResults(base, id), "expired");
    const { context, page } = await friend();
    await page.goto(url);
    await page.waitForSelector(".vote-notice");
    assert.equal(await page.$(".vote-card"), null);
    await context.close();
  });
});

describe("Sondage lancé depuis le web", () => {
  let creator: { context: BrowserContext; page: Page };
  let url: string;
  let id: string;

  before(async () => {
    creator = await friend();
    await creator.page.setGeolocation({ ...HOME, accuracy: 20 });
  });
  after(() => creator.context.close());

  test("user web crée un sondage depuis le site", async () => {
    const { page } = creator;
    await page.goto(base);
    // Les restos ouverts autour de Montréal (selon l'heure, d'autres que ceux du test d'API).
    await page.waitForSelector(".place", { timeout: 60_000 });
    await page.click(".friends");
    await page.waitForSelector(".poll-places input");
    const boxes = await page.$$(".poll-places input");
    assert.ok(boxes.length >= 2, "au moins deux restos à proposer");
    // Le resto affiché est coché d'office : on en ajoute un.
    assert.equal(await page.$eval(".poll-places input", (el) => (el as HTMLInputElement).checked), true);
    await boxes[1].click();
    await page.click(".poll-ttls button:nth-child(2)");
    await Promise.all([page.waitForNavigation(), page.click(".poll-create")]);
    url = page.url();
    id = pollIdFrom(url)!;
    assert.ok(id, `on arrive sur la page du vote (${url})`);
    await page.waitForSelector(".vote-owner");
    const results = live(await apiResults(base, id));
    assert.equal(results.places.length, 2);
    assert.ok(results.expiresAt - Date.now() > 23 * 3_600_000, "ouvert un jour");
  });

  test("user web récupère le lien : « Copier le lien » le met dans le presse-papiers", async () => {
    const { page } = creator;
    await page.click(".vote-chip:not(.vote-chip-danger)");
    await page.waitForSelector(".vote-notice");
    // Juste le lien, sans texte autour.
    const copied = await clipboard(page);
    assert.equal(copied, url);
    // Le lien copié s'ouvre ailleurs sur le même vote.
    const { context, page: other } = await friend();
    await other.goto(copied);
    await other.waitForSelector(".vote-card");
    await context.close();
  });

  test("user web regarde les résultats : ils suivent les votes des copains", async () => {
    const { page } = creator;
    await voteOnPage(page, [true, false]);
    const { context, page: other } = await friend();
    await other.goto(url);
    await voteOnPage(other, [true, true]);
    const seen = await standings(other);
    assert.match(seen.kicker, /2/);
    assert.equal(Object.values(seen.hearts).join(","), "2,1");
    assert.ok(seen.trophy, "un gagnant");
    await context.close();
    // La page du créateur se met à jour toute seule (toutes les 10 s).
    await page.waitForFunction(() => /2/.test(document.querySelector(".vote-kicker")?.textContent ?? ""), { timeout: 15_000 });
  });

  test("user web change d'avis : son vote est remplacé", async () => {
    const { page } = creator;
    const before = live(await apiResults(base, id));
    await page.click(".vote-link");
    await voteOnPage(page, [false, true]);
    const results = live(await apiResults(base, id));
    assert.equal(results.voters, before.voters, "toujours le même nombre de votants");
    assert.deepEqual(results.hearts, [before.hearts[0] - 1, before.hearts[1] + 1]);
    const seen = await standings(page);
    assert.equal(Object.values(seen.hearts).join(","), "2,1");
  });

  test("user web partage le résultat", async () => {
    const { page } = creator;
    const results = live(await apiResults(base, id));
    await page.click(".vote-button-ghost");
    await page.waitForSelector(".vote-notice");
    const text = await clipboard(page);
    assert.ok(text.includes(winner(results)!.name), text);
    assert.ok(text.includes("🏆") && text.endsWith(`/v/${id}`), text);
  });

  test("user web supprime le sondage : il disparaît pour tout le monde", async () => {
    const { page } = creator;
    page.once("dialog", (d) => d.accept());
    await page.click(".vote-chip-danger");
    await page.waitForFunction(() => !document.querySelector(".vote-results") && !!document.querySelector(".vote-notice"));
    assert.equal(await apiResults(base, id), "expired");
    // Oublié aussi des « votes en cours » du navigateur.
    const kept = await page.evaluate(() => localStorage.getItem("groubl:polls"));
    assert.ok(!kept?.includes(id));
  });
});

describe("Notifications au créateur", () => {
  const PUSH = "ExponentPushToken[e2e-creator]";

  test("user app est prévenu quand un copain vote, puis change d'avis — pas de ses propres votes", async () => {
    pushes = [];
    const { id, url } = await apiCreatePoll(base, PLACES, "1h", "fr", { push: PUSH, voter: "app-creator" });

    // Un copain vote sur le web : « Nouveau vote ! », avec le résultat du moment et le lien du sondage.
    const { context, page } = await friend();
    await page.goto(url);
    await voteOnPage(page, [false, true, false]);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].to, PUSH);
    assert.equal(pushes[0].title, "🗳️ Nouveau vote !");
    assert.equal(pushes[0].body, "1 vote · 🏆 Ramen Misoya en tête");
    assert.equal(pushes[0].data.url, `${base}/v/${id}`);

    // Il change d'avis : « Quelqu'un a changé d'avis ».
    await page.click(".vote-link");
    await voteOnPage(page, [true, false, false]);
    assert.equal(pushes.length, 2);
    assert.equal(pushes[1].title, "🔄 Quelqu'un a changé d'avis");
    assert.equal(pushes[1].body, "1 vote · 🏆 La Banquise en tête");
    await context.close();

    // Le créateur vote lui-même : pas de notification.
    await apiVote(base, id, "app-creator", [false, false, true]);
    assert.equal(pushes.length, 2);
  });

  test("sans jeton valide (web, notifications refusées), personne n'est notifié", async () => {
    pushes = [];
    for (const creator of [{}, { push: "pas-un-jeton", voter: "x" }]) {
      const { id } = await apiCreatePoll(base, PLACES, "1h", "fr", creator);
      await apiVote(base, id, "copain", [true, true, true]);
    }
    assert.equal(pushes.length, 0);
  });
});

describe("Le lien de vote amène vers l'app", () => {
  test("l'app reconnaît les liens de vote (site, serveur de dev, schéma de l'app)", () => {
    assert.equal(pollIdFrom("https://www.groubl.com/v/Ab3dEf7h"), "Ab3dEf7h");
    assert.equal(pollIdFrom("https://groubl.com/v/Ab3dEf7h?utm=x"), "Ab3dEf7h");
    assert.equal(pollIdFrom("http://192.168.0.153:5173/v/Ab3dEf7h"), "Ab3dEf7h");
    assert.equal(pollIdFrom("gfaim://v/Ab3dEf7h"), "Ab3dEf7h");
    assert.equal(pollIdFrom("gfaim://?faim=1"), null);
  });

  test("Safari sur iPhone propose d'ouvrir l'app (bannière App Store)", () => {
    assert.match(readFileSync("vote.html", "utf8"), /<meta name="apple-itunes-app" content="app-id=\d+"/);
  });

  test("iOS ouvre l'app sur les liens /v/ (Universal Links)", { skip: !existsSync("public/.well-known/apple-app-site-association") && "fichier pas encore créé (identifiant d'équipe Apple)" }, async () => {
    const res = await fetch(`${base}/.well-known/apple-app-site-association`);
    const aasa = await res.json();
    const details = aasa.applinks.details[0];
    assert.match(details.appIDs[0], /^[A-Z0-9]{10}\.com\.jphilippelingrand\.gfaim$/);
    assert.ok(JSON.stringify(details.components).includes("/v/*"));
  });
});
