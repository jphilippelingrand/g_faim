/**
 * Les appels à l'API des sondages (api/polls.ts du site), sans rien de React Native : l'app s'en sert (via
 * polls.ts), et les tests de bout en bout (e2e/ à la racine) aussi, tels quels.
 */

export type PollTtl = "1h" | "1d" | "1w";
export const POLL_TTLS: PollTtl[] = ["1h", "1d", "1w"];
export const POLL_MIN = 2;
export const POLL_MAX = 5;

/** Un resto proposé, tel que le serveur le garde et le renvoie. */
export type PollPlace = { name: string; cuisine?: string; address?: string; lat: number; lng: number };
/**
 * Où en est un sondage : les restos, leurs ❤️, le nombre de votants, et son propre vote (null si pas encore).
 * `closed` : le vote est fini (après `expiresAt`) ; le résultat reste lisible jusqu'à `keepUntil`.
 */
export type PollLive = {
  places: PollPlace[];
  hearts: number[];
  voters: number;
  expiresAt: number;
  keepUntil: number;
  closed: boolean;
  mine: boolean[] | null;
};
/** "expired" : le sondage n'existe plus (résultat plus gardé, ou supprimé). */
export type PollResults = PollLive | "expired";
export type CreatedPoll = { id: string; url: string; expiresAt: number; keepUntil: number; owner: string };

async function call(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok && res.status !== 404) throw new Error(`poll ${res.status}`);
  return res;
}

/**
 * Lance un sondage. `creator.push` : le jeton de notification de l'iPhone (prévenu à chaque vote d'un copain) ;
 * `creator.voter` : son identifiant de votant (ses propres votes ne le notifient pas).
 */
export async function apiCreatePoll(
  base: string,
  places: PollPlace[],
  ttl: PollTtl,
  lang: string,
  creator: { push?: string; voter?: string } = {},
): Promise<CreatedPoll> {
  const res = await call(`${base}/api/polls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ places, ttl, lang, ...creator }),
  });
  return res.json();
}

export async function apiResults(base: string, id: string, voter?: string): Promise<PollResults> {
  const query = voter ? `?voter=${encodeURIComponent(voter)}` : "";
  const res = await call(`${base}/api/polls/${id}${query}`);
  return res.status === 404 ? "expired" : res.json();
}

/** Vote (ou change d'avis : le même votant remplace son vote). */
export async function apiVote(base: string, id: string, voter: string, likes: boolean[]): Promise<PollResults> {
  const res = await call(`${base}/api/polls/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voter, likes }),
  });
  return res.status === 404 ? "expired" : res.json();
}

/** Supprime le sondage pour tout le monde ; il faut la clé remise à sa création. */
export async function apiDelete(base: string, id: string, owner: string): Promise<void> {
  await call(`${base}/api/polls/${id}`, { method: "DELETE", body: JSON.stringify({ owner }) });
}

/** L'identifiant d'un lien de vote (https://www.groubl.com/v/<id>, le serveur de dev, ou gfaim://v/<id>). */
export function pollIdFrom(url: string): string | null {
  return url.match(/\/v\/([A-Za-z0-9]{8})(?:[/?#]|$)/)?.[1] ?? null;
}

/** Les restos du plus aimé au moins aimé (à égalité, dans l'ordre proposé). */
export function ranking(live: PollLive): { place: PollPlace; hearts: number }[] {
  return live.places.map((place, i) => ({ place, hearts: live.hearts[i] })).sort((a, b) => b.hearts - a.hearts);
}

/** Le gagnant du moment : seul en tête avec au moins un ❤️ ; null s'il n'y a pas encore de vote ou une égalité. */
export function winner(live: PollLive): PollPlace | null {
  const [first, second] = ranking(live);
  return first && first.hearts > 0 && (!second || second.hearts < first.hearts) ? first.place : null;
}

/**
 * Le message pour partager le résultat. `texts.won` contient {name} (« Le groupe a choisi {name} 🏆 »),
 * `texts.open` sert tant qu'il n'y a pas de gagnant (« On mange où ? Vote ici »).
 */
export function resultShareText(live: PollLive, url: string, texts: { won: string; open: string }): string {
  const best = winner(live);
  return `${best ? texts.won.replace("{name}", best.name) : texts.open} ${url}`;
}
