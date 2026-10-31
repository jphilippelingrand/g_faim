/**
 * Les sondages « On mange où ? » : l'app propose 2 à 5 restos, les copains swipent ❤️ / ✕ chacun sur
 * groubl.com/v/<id>, le resto avec le plus de ❤️ gagne. Anonyme : un vote par téléphone (identifiant tiré au
 * hasard par la page), qu'on peut refaire.
 *
 *   POST   /api/polls          { places, ttl: "1h" | "1d" | "1w", lang, push?, voter? }  → { id, url, expiresAt, owner }
 *   GET    /api/polls/<id>     → { places, expiresAt, voters, hearts }  (?voter=… : et `mine`, son vote)
 *   POST   /api/polls/<id>     { voter, likes: boolean[] }               → pareil que GET
 *   DELETE /api/polls/<id>     { owner }                                 → 204
 *
 * `owner` est la clé secrète remise à l'app qui a créé le sondage : seule elle peut le supprimer (le lien,
 * lui, circule chez tous les votants).
 * `push` : le jeton de notification Expo du créateur (app) ; il est prévenu à chaque vote ou changement
 * d'avis d'un copain (pas des siens : `voter` est son identifiant de votant).
 *
 * (vercel.json réécrit /api/polls/<id> en /api/polls?id=<id> : une seule fonction.)
 * Stockage : Redis (REDIS_URL) ; chaque sondage expire tout seul.
 * Sans Redis configuré, hors Vercel (npm run dev), les sondages vivent en mémoire.
 */

import { createClient, type RedisClientType } from "redis";

const SITE = "https://www.groubl.com";
const TTL = { "1h": 3600, "1d": 86_400, "1w": 604_800 } as const;
const MIN_PLACES = 2;
const MAX_PLACES = 5;
const MAX_VOTERS = 100;

type Place = { name: string; cuisine?: string; address?: string; lat: number; lng: number };
type Poll = { places: Place[]; lang: string; expiresAt: number; owner: string; push?: string; creator?: string };

// ——— Stockage ———

// Redis Cloud (offre gratuite), par son URL redis://… dans les variables d'environnement de Vercel.
const REDIS_URL = process.env.REDIS_URL;

// Une connexion par instance de la fonction, réutilisée tant qu'elle reste chaude.
let connection: Promise<RedisClientType> | null = null;
function redis(): Promise<RedisClientType> {
  connection ??= createClient({ url: REDIS_URL })
    .on("error", (err) => console.error("Redis", err))
    .connect()
    .then((c) => c as RedisClientType)
    .catch((err) => {
      connection = null;
      throw err;
    });
  return connection;
}

// En local seulement : la mémoire du serveur de dev.
const memory = new Map<string, { poll: Poll; votes: Map<string, string> }>();

const store = {
  async create(id: string, poll: Poll) {
    if (!REDIS_URL) return void memory.set(id, { poll, votes: new Map() });
    const db = await redis();
    await db.set(`poll:${id}`, JSON.stringify(poll), { expiration: { type: "EXAT", value: Math.floor(poll.expiresAt / 1000) }, condition: "NX" });
  },
  /** Le sondage et tous les votes ; `mine` : celui de ce téléphone, s'il a voté. */
  async read(id: string, voter?: string): Promise<{ poll: Poll; votes: string[]; mine: string | null } | null> {
    if (!REDIS_URL) {
      const found = memory.get(id);
      if (!found || found.poll.expiresAt < Date.now()) return null;
      return { poll: found.poll, votes: [...found.votes.values()], mine: (voter && found.votes.get(voter)) || null };
    }
    const db = await redis();
    const [poll, votes] = await Promise.all([db.get(`poll:${id}`), db.hGetAll(`poll:${id}:votes`)]);
    return poll ? { poll: JSON.parse(poll), votes: Object.values(votes), mine: (voter && votes[voter]) || null } : null;
  },
  async remove(id: string) {
    if (!REDIS_URL) return void memory.delete(id);
    const db = await redis();
    await db.del([`poll:${id}`, `poll:${id}:votes`]);
  },
  /** Enregistre (ou remplace) le vote d'un téléphone : "new", "changed", ou "full" si le sondage est plein. */
  async vote(id: string, poll: Poll, voter: string, likes: string): Promise<"new" | "changed" | "full"> {
    if (!REDIS_URL) {
      const votes = memory.get(id)!.votes;
      const known = votes.has(voter);
      if (!known && votes.size >= MAX_VOTERS) return "full";
      votes.set(voter, likes);
      return known ? "changed" : "new";
    }
    const db = await redis();
    const key = `poll:${id}:votes`;
    const [known, count] = await Promise.all([db.hExists(key, voter), db.hLen(key)]);
    if (!known && count >= MAX_VOTERS) return "full";
    await db.multi().hSet(key, voter, likes).expireAt(key, Math.floor(poll.expiresAt / 1000)).exec();
    return known ? "changed" : "new";
  },
};

// ——— Notifications ———

// Le service de push d'Expo (gratuit) ; remplaçable pour les tests de bout en bout.
const PUSH_URL = () => process.env.PUSH_URL ?? "https://exp.host/--/api/v2/push/send";

const PUSH_TEXT = {
  fr: { new: "🗳️ Nouveau vote !", changed: "🔄 Quelqu'un a changé d'avis", lead: "🏆 {name} en tête", tie: "égalité pour l'instant", votes: ["1 vote", "{n} votes"] },
  en: { new: "🗳️ New vote!", changed: "🔄 Someone changed their mind", lead: "🏆 {name} leads", tie: "tied for now", votes: ["1 vote", "{n} votes"] },
  es: { new: "🗳️ ¡Nuevo voto!", changed: "🔄 Alguien cambió de opinión", lead: "🏆 {name} va primero", tie: "empate por ahora", votes: ["1 voto", "{n} votos"] },
};

/**
 * Prévient le créateur (son téléphone) qu'un copain a voté ou changé d'avis, avec le résultat du moment ;
 * toucher la notification ouvre le sondage dans l'app. Une notification ratée ne fait pas échouer le vote.
 */
async function notifyCreator(poll: Poll, url: string, kind: "new" | "changed", votes: string[]) {
  if (!poll.push) return;
  const text = PUSH_TEXT[poll.lang as keyof typeof PUSH_TEXT] ?? PUSH_TEXT.fr;
  const { hearts } = results(poll, votes, null);
  const best = Math.max(...hearts);
  const leaders = hearts.filter((h) => h === best).length;
  const count = votes.length === 1 ? text.votes[0] : text.votes[1].replace("{n}", String(votes.length));
  const standing = best > 0 && leaders === 1 ? text.lead.replace("{name}", poll.places[hearts.indexOf(best)].name) : text.tie;
  try {
    await fetch(PUSH_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: poll.push, title: text[kind], body: `${count} · ${standing}`, sound: "default", data: { url } }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.error("Push", err);
  }
}

// ——— Vérifications ———

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : undefined);
const coord = (v: unknown, limit: number) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit ? v : undefined);

function parsePlaces(input: unknown): Place[] | null {
  if (!Array.isArray(input) || input.length < MIN_PLACES || input.length > MAX_PLACES) return null;
  const places: Place[] = [];
  for (const p of input) {
    const name = text(p?.name, 120);
    const lat = coord(p?.lat, 90);
    const lng = coord(p?.lng, 180);
    if (!name || lat === undefined || lng === undefined) return null;
    places.push({ name, lat, lng, cuisine: text(p.cuisine, 40), address: text(p.address, 200) });
  }
  return places;
}

/** Identifiant tiré au hasard, sans caractères ambigus (0/O, 1/l/I) : 8 pour le lien, plus pour la clé. */
function newId(length = 8): string {
  const alphabet = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

// ——— Réponses ———

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Ce que voit la page : les restos, le nombre de ❤️ de chacun, et son propre vote (jamais celui des autres). */
function results(poll: Poll, votes: string[], mine: string | null) {
  const hearts = poll.places.map((_, i) => votes.filter((v) => v[i] === "1").length);
  return {
    places: poll.places,
    lang: poll.lang,
    expiresAt: poll.expiresAt,
    voters: votes.length,
    hearts,
    mine: mine ? [...mine].map((c) => c === "1") : null,
  };
}

/** D'où viennent les liens : groubl.com en ligne ; en local, le serveur de dev (le téléphone l'ouvre sur le même Wi-Fi). */
const origin = (request: Request) => (process.env.VERCEL ? SITE : new URL(request.url).origin);

function idFrom(request: Request): string | null {
  const id = new URL(request.url).searchParams.get("id");
  return id && /^[A-Za-z0-9]{8}$/.test(id) ? id : null;
}

function storageMissing() {
  // Sur Vercel, sans Redis branché : on le dit clairement plutôt que de perdre les sondages.
  return !REDIS_URL && process.env.VERCEL ? json({ error: "storage" }, 503) : null;
}

export async function GET(request: Request): Promise<Response> {
  const missing = storageMissing();
  if (missing) return missing;
  const id = idFrom(request);
  if (!id) return json({ error: "id" }, 400);
  const voter = text(new URL(request.url).searchParams.get("voter"), 64);
  const found = await store.read(id, voter);
  return found ? json(results(found.poll, found.votes, found.mine)) : json({ error: "expired" }, 404);
}

export async function POST(request: Request): Promise<Response> {
  const missing = storageMissing();
  if (missing) return missing;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "body" }, 400);
  const id = idFrom(request);

  // Un vote.
  if (id) {
    const found = await store.read(id);
    if (!found) return json({ error: "expired" }, 404);
    const voter = text(body.voter, 64);
    const likes = body.likes;
    if (!voter || !Array.isArray(likes) || likes.length !== found.poll.places.length || !likes.every((l) => typeof l === "boolean")) {
      return json({ error: "vote" }, 400);
    }
    const kind = await store.vote(id, found.poll, voter, likes.map((l) => (l ? "1" : "0")).join(""));
    if (kind === "full") return json({ error: "full" }, 409);
    const after = await store.read(id, voter);
    if (voter !== found.poll.creator) await notifyCreator(found.poll, `${origin(request)}/v/${id}`, kind, after!.votes);
    return json(results(after!.poll, after!.votes, after!.mine));
  }

  // Un nouveau sondage.
  const places = parsePlaces(body.places);
  const ttl = TTL[body.ttl as keyof typeof TTL];
  if (!places || !ttl) return json({ error: "poll" }, 400);
  const lang = ["fr", "en", "es"].includes(body.lang as string) ? (body.lang as string) : "fr";
  // Jeton Expo (« ExponentPushToken[…] ») : le créateur sera prévenu des votes.
  const push = typeof body.push === "string" && /^Expo(nent)?PushToken\[[^\]]{1,200}\]$/.test(body.push) ? body.push : undefined;
  const poll: Poll = { places, lang, expiresAt: Date.now() + ttl * 1000, owner: newId(24), push, creator: text(body.voter, 64) };
  const newPollId = newId();
  await store.create(newPollId, poll);
  return json({ id: newPollId, url: `${origin(request)}/v/${newPollId}`, expiresAt: poll.expiresAt, owner: poll.owner }, 201);
}

export async function DELETE(request: Request): Promise<Response> {
  const missing = storageMissing();
  if (missing) return missing;
  const id = idFrom(request);
  if (!id) return json({ error: "id" }, 400);
  const body = (await request.json().catch(() => null)) as { owner?: unknown } | null;
  const found = await store.read(id);
  // Déjà expiré ou supprimé : c'est fait.
  if (!found) return new Response(null, { status: 204 });
  if (typeof body?.owner !== "string" || body.owner !== found.poll.owner) return json({ error: "owner" }, 403);
  await store.remove(id);
  return new Response(null, { status: 204 });
}
