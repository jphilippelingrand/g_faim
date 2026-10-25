/**
 * Accès à l'API Instagram (connexion Instagram, compte pro, sans page Facebook).
 * Le jeton vient de META_IG_TOKEN : .env en local (node --env-file=.env …), secret GitHub en CI.
 */

const API = "https://graph.instagram.com/v23.0";

export const SITE = "https://www.groubl.com";

export function token() {
  const value = process.env.META_IG_TOKEN;
  if (!value) throw new Error("META_IG_TOKEN manquant (fichier .env en local, secret GitHub en CI).");
  return value;
}

/** Appel GET ou POST ; les erreurs de Meta remontent avec leur message. */
export async function ig(path, { method = "GET", params = {} } = {}) {
  const query = new URLSearchParams({ ...params, access_token: token() });
  const url = path.startsWith("https://") ? `${path}?${query}` : `${API}/${path}?${query}`;
  const res = await fetch(url, { method });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new Error(`Instagram ${method} ${path} : ${e.message ?? res.status}${e.code ? ` (code ${e.code})` : ""}`);
  }
  return body;
}

/** Le compte connecté : son identifiant (pour publier) et son nom (pour reconnaître ses propres réponses). */
export async function me() {
  return ig("me", { params: { fields: "user_id,username" } });
}

/** Légende comparée sans tenir compte des espaces : Instagram en normalise certains. */
export const sameCaption = (a = "", b = "") => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
