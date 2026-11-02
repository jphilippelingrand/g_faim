import Constants from "expo-constants";
import { Platform, Settings } from "react-native";
import { lang } from "../i18n";
import type { Restaurant } from "./places";
import { pushToken } from "./notifications";
import { apiCreatePoll, apiDelete, apiResults, apiVote, pollIdFrom, type PollPlace, type PollResults, type PollTtl } from "./pollsApi";

export { POLL_MAX, POLL_MIN, POLL_TTLS, pollIdFrom, ranking, resultShareText, winner } from "./pollsApi";
export type { PollLive, PollPlace, PollResults, PollTtl } from "./pollsApi";

/**
 * Les sondages « On mange où ? » vus de l'app : ceux qu'on lance (avec la clé qui permet de les supprimer)
 * et ceux qu'on rejoint par un lien, retenus par l'iPhone tant que leur résultat se lit (le double de la durée du vote). On y vote aussi, sous un
 * identifiant anonyme propre à l'iPhone. Les appels eux-mêmes sont dans pollsApi.ts.
 */

/**
 * Un sondage suivi sur l'iPhone ; `owner` : la clé pour le supprimer, seulement si on l'a lancé. Vote fini à
 * `expiresAt`, résultat gardé jusqu'à `keepUntil` (absent sur les sondages d'avant : rien après la fin).
 */
export type MyPoll = { url: string; expiresAt: number; keepUntil?: number; names: string[]; owner?: string };

const keptUntil = (poll: MyPoll) => poll.keepUntil ?? poll.expiresAt;

const KEY = "polls";
const VOTER_KEY = "pollVoter";

/**
 * En dev, le serveur du site sur le Mac (npm run dev -- --host, port 5173), à la même adresse que Metro :
 * les sondages de test restent en mémoire, loin de la vraie base. En production, groubl.com.
 */
function apiBase(): string {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return __DEV__ && host ? `http://${host}:5173` : "https://www.groubl.com";
}

const idOf = (poll: MyPoll) => pollIdFrom(poll.url)!;

/** L'identifiant anonyme de l'iPhone pour voter, le même pour tous les sondages. */
function voterId(): string {
  let id = Platform.OS === "ios" ? Settings.get(VOTER_KEY) : null;
  if (typeof id !== "string") {
    id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    if (Platform.OS === "ios") Settings.set({ [VOTER_KEY]: id });
  }
  return id;
}

function save(polls: MyPoll[]) {
  if (Platform.OS === "ios") Settings.set({ [KEY]: JSON.stringify(polls) });
}

/** Les sondages en cours ou terminés depuis peu, le plus récent d'abord (les autres sont oubliés au passage). */
export function myPolls(): MyPoll[] {
  if (Platform.OS !== "ios") return [];
  let saved: MyPoll[] = [];
  try {
    saved = JSON.parse(Settings.get(KEY) ?? "[]");
  } catch {
    /* préférence abîmée : on repart de zéro */
  }
  const kept = saved.filter((p) => keptUntil(p) > Date.now());
  if (kept.length !== saved.length) save(kept);
  return kept;
}

export async function createPoll(places: Restaurant[], ttl: PollTtl): Promise<MyPoll> {
  const proposed: PollPlace[] = places.map((r) => ({
    name: r.name,
    cuisine: r.cuisine,
    address: r.address,
    lat: r.location.latitude,
    lng: r.location.longitude,
  }));
  // Pour être prévenu quand un copain vote (si on accepte les notifications).
  const push = await pushToken();
  const { url, expiresAt, keepUntil, owner } = await apiCreatePoll(apiBase(), proposed, ttl, lang, { push, voter: voterId() });
  const poll = { url, expiresAt, keepUntil, owner, names: places.map((r) => r.name) };
  save([poll, ...myPolls()]);
  return poll;
}

/**
 * Un lien de vote reçu (ouvert depuis Messages & co) : on le suit dans l'app. null s'il n'existe plus.
 * Déjà suivi (le sien, ou rejoint avant) : on le garde tel quel, avec sa clé.
 */
export async function joinPoll(url: string): Promise<MyPoll | null> {
  const id = pollIdFrom(url);
  if (!id) return null;
  const known = myPolls().find((p) => pollIdFrom(p.url) === id);
  if (known) return known;
  const results = await apiResults(apiBase(), id);
  if (results === "expired") return null;
  const poll = { url, expiresAt: results.expiresAt, keepUntil: results.keepUntil, names: results.places.map((p) => p.name) };
  save([poll, ...myPolls()]);
  return poll;
}

/** Le résultat du moment, avec son propre vote. */
export function pollResults(poll: MyPoll): Promise<PollResults> {
  return apiResults(apiBase(), idOf(poll), voterId());
}

/** Voter, ou changer d'avis (le vote de l'iPhone est remplacé). */
export function votePoll(poll: MyPoll, likes: boolean[]): Promise<PollResults> {
  return apiVote(apiBase(), idOf(poll), voterId(), likes);
}

/** Supprime le sondage pour tout le monde (si on l'a lancé), et l'oublie sur l'iPhone. */
export async function deletePoll(poll: MyPoll): Promise<void> {
  if (poll.owner) await apiDelete(apiBase(), idOf(poll), poll.owner);
  forgetPoll(poll);
}

/** L'enlève de la liste de l'iPhone (rejoint par un lien, supprimé, ou déjà expiré). */
export function forgetPoll(poll: MyPoll) {
  save(myPolls().filter((p) => p.url !== poll.url));
}
