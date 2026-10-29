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

// Une lecture coupée par le réseau (« fetch failed », « other side closed ») est retentée, avec une pause.
// Une écriture ne l'est pas : elle a pu arriver chez Meta, la refaire publierait deux fois.
const GET_RETRIES = 3;

/** Appel GET ou POST ; les erreurs de Meta remontent avec leur message. */
export async function ig(path, { method = "GET", params = {} } = {}) {
  const query = new URLSearchParams({ ...params, access_token: token() });
  const url = path.startsWith("https://") ? `${path}?${query}` : `${API}/${path}?${query}`;
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(url, { method });
      break;
    } catch (err) {
      if (method !== "GET" || attempt === GET_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
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
