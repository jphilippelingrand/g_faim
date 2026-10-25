/**
 * Vérifie le jeton Instagram, ou le prolonge (il expire 60 jours après sa création ou son dernier
 * renouvellement ; on peut le renouveler dès qu'il a 24 h).
 *
 *   node --env-file=.env social/token.mjs            (compte connecté)
 *   node --env-file=.env social/token.mjs --refresh  (nouveau jeton, écrit dans .env)
 *
 * Après un --refresh, remplacer aussi le secret META_IG_TOKEN sur GitHub (Settings → Secrets and
 * variables → Actions), sinon la publication automatique s'arrêtera à l'expiration de l'ancien.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ig, me } from "./instagram.mjs";

const account = await me();
console.log(`Connecté : @${account.username} (${account.user_id})`);

if (process.argv[2] === "--refresh") {
  const { access_token, expires_in } = await ig("https://graph.instagram.com/refresh_access_token", {
    params: { grant_type: "ig_refresh_token" },
  });
  const envFile = new URL("../.env", import.meta.url);
  const env = readFileSync(envFile, "utf8");
  writeFileSync(envFile, env.replace(/^META_IG_TOKEN=.*$/m, `META_IG_TOKEN=${access_token}`));
  console.log(`Nouveau jeton écrit dans .env, valable ${Math.round(expires_in / 86400)} jours. Mets-le aussi dans le secret GitHub.`);
}
