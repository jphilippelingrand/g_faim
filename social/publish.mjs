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
 * Un post est une image ("image"), un carrousel ("images", 2 à 10) ou un reel ("video" MP4, "cover" en option).
 * Une image seule peut identifier des comptes : "tags": [{ "username": "bar.darling", "x": 0.6, "y": 0.4 }]
 * (position relative dans l'image, de 0 à 1). L'API ne le permet pas pour les stories.
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

// QUEUE : une autre copie de la file (le robot du Mac lit celle de GitHub, sans toucher aux fichiers locaux).
const queue = JSON.parse(readFileSync(process.env.QUEUE ?? new URL("./queue.json", import.meta.url), "utf8"));
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

/** Le fichier est-il en ligne, du bon type ? Sinon Meta échoue avec un message obscur. */
async function checkOnline(post, url, type) {
  const head = await fetch(url, { method: "HEAD" });
  if (!head.ok || !head.headers.get("content-type")?.startsWith(type)) {
    throw new Error(`${post.id} : ${url} n'est pas en ligne (${head.status}).`);
  }
}

/** Meta prépare le média avant qu'on puisse publier : on attend qu'il soit prêt (une vidéo prend plus longtemps). */
async function waitReady(post, containerId, video = false) {
  for (let i = 0; ; i++) {
    const { status_code } = await ig(containerId, { params: { fields: "status_code" } });
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || i === (video ? 60 : 20)) throw new Error(`${post.id} : Instagram n'a pas pu préparer le média (${status_code}).`);
    await new Promise((r) => setTimeout(r, video ? 5000 : 3000));
  }
}

for (const post of due) {
  // Trois formes : une image ("image"), un carrousel ("images", 2 à 10), un reel ("video", avec "cover" en option).
  const images = (post.images ?? (post.image ? [post.image] : [])).map((path) => `${SITE}/${path}`);
  const videoUrl = post.video && `${SITE}/${post.video}`;
  if (mode === "--dry-run") {
    console.log(`Partirait : ${post.id} (${videoUrl ?? images.join(", ")})`);
    continue;
  }
  for (const url of images) await checkOnline(post, url, "image/");
  if (videoUrl) await checkOnline(post, videoUrl, "video/");

  let params;
  if (post.story) params = { image_url: images[0], media_type: "STORIES" };
  else if (videoUrl) {
    params = { media_type: "REELS", video_url: videoUrl, caption: post.caption, share_to_feed: "true" };
    if (post.cover) params.cover_url = `${SITE}/${post.cover}`;
  } else if (images.length > 1) {
    // Carrousel : un conteneur par image, puis un conteneur qui les regroupe et porte la légende.
    const children = [];
    for (const url of images) {
      const child = await ig(`${account.user_id}/media`, { method: "POST", params: { image_url: url, is_carousel_item: "true" } });
      await waitReady(post, child.id);
      children.push(child.id);
    }
    params = { media_type: "CAROUSEL", children: children.join(","), caption: post.caption };
  } else {
    params = { image_url: images[0], caption: post.caption, ...(post.tags && { user_tags: JSON.stringify(post.tags) }) };
  }
  const container = await ig(`${account.user_id}/media`, { method: "POST", params });
  await waitReady(post, container.id, Boolean(videoUrl));
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
