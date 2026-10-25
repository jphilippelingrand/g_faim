/**
 * Publie sur Instagram les posts de social/queue.json arrivés à leur heure.
 *
 *   node --env-file=.env social/publish.mjs            (publie ce qui est dû)
 *   node --env-file=.env social/publish.mjs --list     (état de la file, sans rien publier)
 *   node --env-file=.env social/publish.mjs --dry-run  (montre ce qui partirait maintenant)
 *
 * Lancé toutes les 15 minutes par .github/workflows/instagram.yml. Sans état à garder : un post est
 * considéré publié si une publication récente du compte a la même légende. Une story n'a pas de
 * légende : elle n'est publiée qu'à la main (hors CI), et marquée "published" dans la file ensuite.
 * Les images doivent être en ligne (public/social/, déployées par Vercel) avant l'heure du post.
 */
import { readFileSync } from "node:fs";
import { ig, me, sameCaption, SITE } from "./instagram.mjs";

// Un post en retard de plus que ça n'est plus publié (CI arrêtée longtemps, file mal datée…).
const MAX_LATE_HOURS = 24;

// En CI avant que le secret soit posé : on s'arrête sans échec (pas d'e-mail d'erreur tous les quarts d'heure).
if (process.env.CI && !process.env.META_IG_TOKEN) {
  console.log("Pas encore de secret META_IG_TOKEN : rien à faire.");
  process.exit(0);
}

const queue = JSON.parse(readFileSync(new URL("./queue.json", import.meta.url), "utf8"));
const mode = process.argv[2];
const now = Date.now();

const account = await me();
const { data: recent = [] } = await ig(`${account.user_id}/media`, { params: { fields: "caption,timestamp", limit: "50" } });
const published = (post) => Boolean(post.published) || recent.some((m) => sameCaption(m.caption, post.caption));

if (mode === "--list") {
  for (const post of queue) {
    const state = published(post) ? "publié" : Date.parse(post.at) <= now ? "en retard" : "à venir";
    console.log(`${post.at}  ${state.padEnd(9)}  ${post.id}`);
  }
  process.exit(0);
}

const due = queue.filter((post) => {
  const at = Date.parse(post.at);
  return at <= now && now - at <= MAX_LATE_HOURS * 3_600_000 && !published(post) && !(post.story && process.env.CI);
});
if (!due.length) {
  console.log(`@${account.username} : rien à publier.`);
  process.exit(0);
}

for (const post of due) {
  const imageUrl = `${SITE}/${post.image}`;
  if (mode === "--dry-run") {
    console.log(`Partirait : ${post.id} (${imageUrl})`);
    continue;
  }
  // Une image pas encore déployée ferait échouer Meta avec un message obscur : on vérifie avant.
  const head = await fetch(imageUrl, { method: "HEAD" });
  if (!head.ok || !head.headers.get("content-type")?.startsWith("image/")) {
    throw new Error(`${post.id} : ${imageUrl} n'est pas en ligne (${head.status}).`);
  }

  const container = await ig(`${account.user_id}/media`, {
    method: "POST",
    params: post.story ? { image_url: imageUrl, media_type: "STORIES" } : { image_url: imageUrl, caption: post.caption },
  });
  // Meta prépare l'image avant qu'on puisse publier : on attend qu'elle soit prête (une minute au plus).
  for (let i = 0; ; i++) {
    const { status_code } = await ig(container.id, { params: { fields: "status_code" } });
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || i === 20) throw new Error(`${post.id} : Instagram n'a pas pu préparer l'image (${status_code}).`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  // « Media ID is not available » (code 9007) arrive parfois juste après FINISHED : on réessaie un peu plus tard.
  let id;
  for (let i = 0; !id; i++) {
    try {
      ({ id } = await ig(`${account.user_id}/media_publish`, { method: "POST", params: { creation_id: container.id } }));
    } catch (err) {
      if (!String(err.message).includes("code 9007") || i === 5) throw err;
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  console.log(`Publié : ${post.id} → ${id}`);
}
