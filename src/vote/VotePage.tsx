import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { lang } from "../i18n";
import { placeUrl } from "../lib/mapsApp";
import { cuisineLabel } from "../lib/osm";
import {
  API_BASE,
  apiResults,
  apiVote,
  deletePoll,
  ownPoll,
  pagePollId,
  resultShareText,
  voterId,
  winner,
  type PollLive,
} from "../lib/polls";

/**
 * La page d'un sondage « On mange où ? » (groubl.com/v/<id>), comme dans l'app : la carte des restos proposés,
 * puis le classement (rang, nombre de ❤️). Toucher un resto met (ou retire) son ❤️ tout de suite : on change
 * d'avis quand on veut, le classement suit sans attendre le serveur. Les touches rapprochées partent en un
 * seul vote (une seule notification au créateur). Chaque resto s'ouvre dans Maps. Rafraîchi tout seul.
 * Celui qui l'a lancé depuis ce navigateur peut aussi copier le lien et supprimer le vote. Une fois le vote
 * fini, le résultat reste affiché (figé, l'élu en grand) le temps que le serveur le garde. Anonyme : un
 * identifiant tiré au hasard par navigateur. Voir api/polls.ts.
 * Sur grand écran : la carte à gauche, le classement à droite.
 */

type State = { kind: "loading" } | { kind: "gone" } | { kind: "error" } | { kind: "ready"; poll: PollLive };

const TEXT = {
  fr: {
    title: "On mange où ?",
    tapToVote: "Touche les restos qui te disent ❤️. Tu peux changer d'avis quand tu veux.",
    left: { m: "Encore {n} min", h: "Encore {n} h", d: "Encore {n} jours" },
    votes: { none: "Pas encore de vote", one: "1 vote", many: "{n} votes" },
    gone: "Ce sondage est terminé. Trop tard : ils ont sûrement déjà mangé.",
    error: "Oups, quelque chose a coincé. Réessaie dans un instant.",
    full: "Ce sondage a déjà trop de votes.",
    home: "Trouver un resto ouvert près de moi",
    owner: "C'est ton vote",
    copyLink: "Copier le lien",
    copied: "Copié !",
    remove: "Supprimer le vote",
    removeConfirm: "Supprimer ce vote ? Le lien ne marchera plus pour personne.",
    shareResult: "Partager le résultat",
    won: "Le groupe a choisi {name} 🏆 On y va !",
    invite: "On mange où ? Vote pour tes restos, le groupe décide 🗳️",
    closed: "Vote terminé",
    final: "🏆 Le groupe a choisi {name}",
    tie: "Égalité : à vous de trancher !",
    onMaps: "Voir dans Maps",
  },
  en: {
    title: "Where should we eat?",
    tapToVote: "Tap the places you'd go for ❤️. Change your mind any time.",
    left: { m: "{n} min left", h: "{n} h left", d: "{n} days left" },
    votes: { none: "No votes yet", one: "1 vote", many: "{n} votes" },
    gone: "This poll is over. Too late: they've probably eaten already.",
    error: "Oops, something went wrong. Try again in a moment.",
    full: "This poll already has too many votes.",
    home: "Find an open place near me",
    owner: "This is your vote",
    copyLink: "Copy the link",
    copied: "Copied!",
    remove: "Delete the vote",
    removeConfirm: "Delete this vote? The link will stop working for everyone.",
    shareResult: "Share the result",
    won: "The group picked {name} 🏆 Let's go!",
    invite: "Where should we eat? Vote for your places, the group decides 🗳️",
    closed: "Voting is over",
    final: "🏆 The group picked {name}",
    tie: "It's a tie: your call!",
    onMaps: "Open in Maps",
  },
  es: {
    title: "¿Dónde comemos?",
    tapToVote: "Toca los sitios que te apetecen ❤️. Puedes cambiar de opinión cuando quieras.",
    left: { m: "Quedan {n} min", h: "Quedan {n} h", d: "Quedan {n} días" },
    votes: { none: "Aún no hay votos", one: "1 voto", many: "{n} votos" },
    gone: "Esta encuesta ha terminado. Demasiado tarde: seguro que ya han comido.",
    error: "Uy, algo ha fallado. Inténtalo de nuevo en un momento.",
    full: "Esta encuesta ya tiene demasiados votos.",
    home: "Encontrar un sitio abierto cerca de mí",
    owner: "Es tu votación",
    copyLink: "Copiar el enlace",
    copied: "¡Copiado!",
    remove: "Eliminar la votación",
    removeConfirm: "¿Eliminar esta votación? El enlace dejará de funcionar para todos.",
    shareResult: "Compartir el resultado",
    won: "El grupo eligió {name} 🏆 ¡Vamos!",
    invite: "¿Dónde comemos? Vota tus sitios, el grupo decide 🗳️",
    closed: "Votación terminada",
    final: "🏆 El grupo eligió {name}",
    tie: "Empate: ¡decidid vosotros!",
    onMaps: "Ver en Maps",
  },
}[lang];

const fill = (s: string, n: number) => s.replace("{n}", String(n));
const REFRESH_MS = 10_000;
// Les touches à moins de ça l'une de l'autre partent en un seul vote.
const SEND_DELAY_MS = 900;

// La carte (MapLibre) pèse lourd : chargée à part, la page s'affiche sans l'attendre.
const VoteMap = lazy(() => import("./VoteMap").then((m) => ({ default: m.VoteMap })));

const pollId = pagePollId();
const pageUrl = () => `${location.origin}/v/${pollId}`;

function timeLeft(expiresAt: number): string {
  const minutes = Math.max(1, Math.round((expiresAt - Date.now()) / 60_000));
  if (minutes < 60) return fill(TEXT.left.m, minutes);
  if (minutes < 48 * 60) return fill(TEXT.left.h, Math.round(minutes / 60));
  return fill(TEXT.left.d, Math.round(minutes / 1440));
}

/**
 * Partager un texte, ou juste un lien (`asLink`) : la feuille de partage du téléphone si elle existe, sinon le
 * presse-papiers. true si c'est parti dans le presse-papiers (pour afficher « Copié ! »).
 */
async function share(text: string, asLink = false): Promise<boolean> {
  if (navigator.share) {
    await navigator.share(asLink ? { url: text } : { text }).catch(() => undefined);
    return false;
  }
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // Hors HTTPS (serveur de dev), pas de presse-papiers moderne : l'ancienne méthode.
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return true;
}

export function VotePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Mon vote tel que je viens de le toucher, pas encore confirmé par le serveur (null : celui enregistré).
  const [local, setLocal] = useState<boolean[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [mine] = useState(() => ownPoll(pollId));
  // Le vote en attente d'envoi, et la réponse qui compte (seule celle du dernier envoi).
  const pending = useRef<{ likes: boolean[]; timer: number } | null>(null);
  const sendId = useRef(0);

  const refresh = useCallback(async () => {
    // Pas pendant un vote pas encore envoyé : on garderait l'ancien, et la page clignoterait.
    if (pending.current) return;
    const sent = sendId.current;
    try {
      const results = await apiResults(API_BASE, pollId, voterId());
      // Un vote est parti (ou attend) pendant la requête : sa réponse est plus fraîche que celle-ci.
      if (pending.current || sent !== sendId.current) return;
      setState(results === "expired" ? { kind: "gone" } : { kind: "ready", poll: results });
    } catch {
      setState((s) => (s.kind === "ready" ? s : { kind: "error" }));
    }
  }, []);

  useEffect(() => {
    if (!pollId) return setState({ kind: "gone" });
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function send(likes: boolean[]) {
    pending.current = null;
    const id = ++sendId.current;
    try {
      const results = await apiVote(API_BASE, pollId, voterId(), likes);
      if (id !== sendId.current) return;
      setState(results === "expired" ? { kind: "gone" } : { kind: "ready", poll: results });
      setLocal(null);
    } catch (err) {
      if (id !== sendId.current) return;
      setLocal(null);
      setNotice(String(err).includes("409") ? TEXT.full : TEXT.error);
    }
  }

  // On quitte la page avant l'envoi : le vote part quand même.
  useEffect(() => {
    const flush = () => {
      const p = pending.current;
      if (!p) return;
      clearTimeout(p.timer);
      pending.current = null;
      fetch(`${API_BASE}/api/polls/${pollId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voter: voterId(), likes: p.likes }),
        keepalive: true,
      }).catch(() => undefined);
    };
    addEventListener("pagehide", flush);
    return () => removeEventListener("pagehide", flush);
  }, []);

  async function copyLink() {
    // Juste le lien, sans texte autour.
    if (await share(pageUrl(), true)) setNotice(TEXT.copied);
  }
  async function shareResult(poll: PollLive) {
    if (await share(resultShareText(poll, pageUrl(), { won: TEXT.won, open: TEXT.invite }))) setNotice(TEXT.copied);
  }
  async function remove() {
    if (!mine || !confirm(TEXT.removeConfirm)) return;
    try {
      await deletePoll(mine);
      setState({ kind: "gone" });
    } catch {
      setNotice(TEXT.error);
    }
  }

  if (state.kind !== "ready") {
    return (
      <main className="vote">
        <Brand />
        <h1 className="vote-title">{TEXT.title}</h1>
        {state.kind === "loading" && <div className="vote-spinner" aria-hidden />}
        {state.kind === "error" && <p className="vote-notice">{TEXT.error}</p>}
        {state.kind === "gone" && (
          <>
            <p className="vote-notice">{TEXT.gone}</p>
            <a className="vote-button" href="/">
              {TEXT.home}
            </a>
          </>
        )}
      </main>
    );
  }

  const poll = state.poll;
  // Mon vote : celui que je viens de toucher, sinon l'enregistré ; les ❤️ et les votants en tiennent compte tout de suite.
  const my = local ?? poll.mine;
  const hearts = poll.hearts.map((h, i) => h + (local ? Number(local[i]) - Number(poll.mine?.[i] ?? false) : 0));
  const voters = poll.voters + (local && !poll.mine ? 1 : 0);
  const shown: PollLive = { ...poll, hearts, voters };
  // Pendant le vote, l'ordre proposé (le rang est à gauche) : une ligne touchée ne saute pas sous le doigt.
  // Vote fini : du plus aimé au moins aimé.
  const proposed = poll.places.map((_, i) => i);
  const order = poll.closed ? proposed.sort((a, b) => hearts[b] - hearts[a] || a - b) : proposed;
  const rankOf = (i: number) => 1 + hearts.filter((h) => h > hearts[i]).length;
  const top = winner(shown);
  const topIndex = top ? poll.places.indexOf(top) : null;
  const votes = voters === 0 ? TEXT.votes.none : voters === 1 ? TEXT.votes.one : fill(TEXT.votes.many, voters);

  function toggle(i: number) {
    setFocused(i);
    if (poll.closed) return;
    const likes = (my ?? poll.places.map(() => false)).map((v, j) => (j === i ? !v : v));
    setLocal(likes);
    setNotice(null);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { likes, timer: window.setTimeout(() => send(likes), SEND_DELAY_MS) };
  }

  return (
    <main className="vote vote-ready">
      <header className="vote-head">
        <Brand />
        <h1 className="vote-title">{TEXT.title}</h1>
        {mine && (
          <div className="vote-owner" aria-label={TEXT.owner}>
            <button type="button" className="vote-chip" onClick={copyLink}>
              🔗 {TEXT.copyLink}
            </button>
            <button type="button" className="vote-chip vote-chip-danger" onClick={remove}>
              {TEXT.remove}
            </button>
          </div>
        )}
      </header>

      <div className="vote-map-wrap">
        <Suspense fallback={<div className="vote-map" />}>
          <VoteMap
            places={poll.places}
            selected={focused ?? topIndex}
            labels={voters ? poll.places.map((_, i) => String(rankOf(i))) : undefined}
            onSelect={setFocused}
          />
        </Suspense>
      </div>

      <section className="vote-results" data-synced={local === null}>
        {poll.closed && <p className="vote-final">{top ? TEXT.final.replace("{name}", top.name) : TEXT.tie}</p>}
        <p className="vote-kicker">
          {votes} · {poll.closed ? TEXT.closed : timeLeft(poll.expiresAt)}
        </p>
        {!poll.closed && <p className="vote-sub">{TEXT.tapToVote}</p>}
        {notice && (
          <p className="vote-notice" role="status">
            {notice}
          </p>
        )}

        {/* Chaque resto, son rang à gauche ; à droite, comme un « j'aime » : le nombre de ❤️, le
            cœur plein si on a mis le sien. */}
        {order.map((i) => {
          const place = poll.places[i];
          const like = my?.[i] === true;
          const rank = rankOf(i);
          const cuisine = place.cuisine ? cuisineLabel(place.cuisine) : null;
          const classes = ["vote-row", like && "vote-row-on", i === topIndex && "vote-row-top", i === focused && "vote-row-focused"];
          return (
            <div key={i} className={classes.filter(Boolean).join(" ")} data-index={i} onMouseEnter={() => setFocused(i)}>
              <button
                type="button"
                className="vote-row-main"
                onClick={() => toggle(i)}
                disabled={poll.closed}
                role={poll.closed ? undefined : "checkbox"}
                aria-checked={poll.closed ? undefined : like}
              >
                <span className={`vote-rank${rank === 1 && hearts[i] > 0 ? " vote-rank-first" : ""}`}>{voters ? rank : "·"}</span>
                <span className="vote-row-text">
                  <span className="vote-row-name">
                    {i === topIndex ? "🏆 " : ""}
                    {place.name}
                  </span>
                  {(cuisine || place.address) && (
                    <span className="vote-row-info">
                      {[cuisine && `${cuisine.emoji} ${cuisine.label}`, place.address].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="vote-row-hearts">
                  {like ? "❤️" : "♡"} {hearts[i]}
                </span>
              </button>
              <a className="vote-maps" href={placeUrl(place)} target="_blank" rel="noreferrer" title={TEXT.onMaps} aria-label={`${TEXT.onMaps} : ${place.name}`}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path d="M6 3H3v10h10v-3M9 2.5h4.5V7M13.5 2.5 7.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Maps</span>
              </a>
            </div>
          );
        })}

        <button type="button" className="vote-button vote-button-ghost" onClick={() => shareResult(shown)}>
          🏆 {TEXT.shareResult}
        </button>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <a className="vote-brand" href="/">
      <img src="/icon-192.png" alt="" width={34} height={34} />
      Groubl
    </a>
  );
}
