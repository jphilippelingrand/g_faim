/**
 * Commentaires des dernières publications, et réponse à l'un d'eux.
 *
 *   node --env-file=.env social/comments.mjs                       (commentaires sans réponse de notre part)
 *   node --env-file=.env social/comments.mjs --all                 (tous, avec nos réponses)
 *   node --env-file=.env social/comments.mjs reply <id> "<texte>"  (répond, après validation)
 */
import { ig, me } from "./instagram.mjs";

const POSTS_TO_SCAN = 12;

const [mode, commentId, text] = process.argv.slice(2);

if (mode === "reply") {
  if (!commentId || !text) throw new Error('Usage : comments.mjs reply <id> "<texte>"');
  const { id } = await ig(`${commentId}/replies`, { method: "POST", params: { message: text } });
  console.log(`Réponse publiée (${id}).`);
  process.exit(0);
}

const account = await me();
const { data: media = [] } = await ig(`${account.user_id}/media`, {
  params: { fields: "caption,timestamp,permalink", limit: String(POSTS_TO_SCAN) },
});

let shown = 0;
for (const m of media) {
  const { data: comments = [] } = await ig(`${m.id}/comments`, {
    params: { fields: "id,text,username,timestamp,replies{text,username}", limit: "50" },
  });
  const pending = comments.filter(
    (c) => c.username !== account.username && (mode === "--all" || !c.replies?.data?.some((r) => r.username === account.username)),
  );
  if (!pending.length) continue;
  console.log(`\n== ${m.timestamp.slice(0, 10)} · ${(m.caption ?? "").split("\n")[0]} · ${m.permalink}`);
  for (const c of pending) {
    console.log(`  [${c.id}] @${c.username} : ${c.text}`);
    for (const r of c.replies?.data ?? []) console.log(`      ↳ @${r.username} : ${r.text}`);
    shown++;
  }
}
console.log(shown ? `\n${shown} commentaire(s).` : "Aucun commentaire en attente.");
