/**
 * Les sondages « On mange où ? » vus du site : les mêmes appels que l'app (app/src/lib/pollsApi.ts, partagé
 * tel quel), plus ce que le navigateur retient : l'identifiant anonyme pour voter, et les sondages qu'on a
 * lancés d'ici (avec la clé qui permet de les supprimer).
 */
import { apiCreatePoll, apiDelete, pollIdFrom, type PollPlace, type PollTtl } from "../../app/src/lib/pollsApi";

export * from "../../app/src/lib/pollsApi";

/** Même origine que la page : groubl.com en ligne, le serveur de dev en local. */
export const API_BASE = "";

/** Un sondage lancé depuis ce navigateur ; `owner` : la clé pour le supprimer. Résultat gardé jusqu'à `keepUntil`. */
export type MyPoll = { id: string; url: string; expiresAt: number; keepUntil?: number; names: string[]; owner: string };

const POLLS_KEY = "groubl:polls";
const VOTER_KEY = "groubl:voter";

/** Le stockage du navigateur peut être bloqué (navigation privée stricte) : on fait sans. */
function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* tant pis : rien ne sera retenu */
  }
}

/** L'identifiant anonyme de ce navigateur, le même pour tous les sondages. */
export function voterId(): string {
  let id = load(VOTER_KEY);
  if (!id) {
    // Pas crypto.randomUUID : il n'existe qu'en HTTPS, et le serveur de dev est en http sur le Wi-Fi.
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    store(VOTER_KEY, id);
  }
  return id;
}

/** Les sondages lancés d'ici, en cours ou terminés depuis peu, le plus récent d'abord. */
export function myPolls(): MyPoll[] {
  let saved: MyPoll[] = [];
  try {
    saved = JSON.parse(load(POLLS_KEY) ?? "[]");
  } catch {
    /* abîmé : on repart de zéro */
  }
  const kept = saved.filter((p) => (p.keepUntil ?? p.expiresAt) > Date.now());
  if (kept.length !== saved.length) store(POLLS_KEY, JSON.stringify(kept));
  return kept;
}

/** Le sondage, si on l'a lancé depuis ce navigateur (on peut alors le supprimer). */
export const ownPoll = (id: string) => myPolls().find((p) => p.id === id) ?? null;

export async function createPoll(places: PollPlace[], ttl: PollTtl, lang: string): Promise<MyPoll> {
  const created = await apiCreatePoll(API_BASE, places, ttl, lang);
  const poll = { ...created, names: places.map((p) => p.name) };
  store(POLLS_KEY, JSON.stringify([poll, ...myPolls()]));
  return poll;
}

export async function deletePoll(poll: MyPoll): Promise<void> {
  await apiDelete(API_BASE, poll.id, poll.owner);
  store(POLLS_KEY, JSON.stringify(myPolls().filter((p) => p.id !== poll.id)));
}

/** L'identifiant du sondage de la page (/v/<id>). */
export const pagePollId = () => pollIdFrom(location.pathname) ?? "";
