import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { lang } from "../i18n";
import { cuisineLabel } from "../lib/osm";
import {
  API_BASE,
  apiResults,
  apiVote,
  deletePoll,
  ownPoll,
  pagePollId,
  ranking,
  resultShareText,
  voterId,
  winner,
  type PollLive,
  type PollPlace,
} from "../lib/polls";

/**
 * La page d'un sondage « On mange où ? » (groubl.com/v/<id>) : on swipe chaque resto proposé, ❤️ ou ✕,
 * puis on voit où en est le groupe (rafraîchi tout seul), on peut changer d'avis et partager le résultat.
 * Celui qui l'a lancé depuis ce navigateur peut aussi copier le lien et supprimer le vote. Anonyme : un
 * identifiant tiré au hasard par navigateur. Voir api/polls.ts.
 */

type State = { kind: "loading" } | { kind: "gone" } | { kind: "error" } | { kind: "ready"; poll: PollLive };

const TEXT = {
  fr: {
    title: "On mange où ?",
    howTo: "Swipe chaque resto : ❤️ si ça te dit, ✕ sinon.",
    left: { m: "Encore {n} min", h: "Encore {n} h", d: "Encore {n} jours" },
    nope: "NAN",
    yum: "MIAM",
    sending: "J'envoie ton vote…",
    verdict: "Le ventre du groupe a parlé",
    leading: "En tête pour l'instant",
    votes: { one: "1 vote", many: "{n} votes" },
    go: "Y aller",
    revote: "Changer d'avis",
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
    invite: "On mange où ? Swipe les restos, le groupe décide 🗳️",
  },
  en: {
    title: "Where should we eat?",
    howTo: "Swipe each place: ❤️ if you're in, ✕ if not.",
    left: { m: "{n} min left", h: "{n} h left", d: "{n} days left" },
    nope: "NOPE",
    yum: "YUM",
    sending: "Sending your vote…",
    verdict: "The group's belly has spoken",
    leading: "Leading for now",
    votes: { one: "1 vote", many: "{n} votes" },
    go: "Let's go",
    revote: "Change my mind",
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
    invite: "Where should we eat? Swipe the places, the group decides 🗳️",
  },
  es: {
    title: "¿Dónde comemos?",
    howTo: "Desliza cada sitio: ❤️ si te apetece, ✕ si no.",
    left: { m: "Quedan {n} min", h: "Quedan {n} h", d: "Quedan {n} días" },
    nope: "NO",
    yum: "ÑAM",
    sending: "Enviando tu voto…",
    verdict: "La barriga del grupo ha hablado",
    leading: "En cabeza por ahora",
    votes: { one: "1 voto", many: "{n} votos" },
    go: "Vamos",
    revote: "Cambiar de opinión",
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
    invite: "¿Dónde comemos? Desliza los sitios, el grupo decide 🗳️",
  },
}[lang];

const fill = (s: string, n: number) => s.replace("{n}", String(n));
const THRESHOLD = 90;
const FLY_MS = 240;
const REFRESH_MS = 10_000;
const IS_APPLE = /iPhone|iPad|Macintosh/.test(navigator.userAgent);

const pollId = pagePollId();
const pageUrl = () => `${location.origin}/v/${pollId}`;

function timeLeft(expiresAt: number): string {
  const minutes = Math.max(1, Math.round((expiresAt - Date.now()) / 60_000));
  if (minutes < 60) return fill(TEXT.left.m, minutes);
  if (minutes < 48 * 60) return fill(TEXT.left.h, Math.round(minutes / 60));
  return fill(TEXT.left.d, Math.round(minutes / 1440));
}

/** La fiche du resto dans Plans (iPhone, Mac) ou Google Maps (le reste). */
function mapsUrl(p: PollPlace): string {
  const query = p.address ? `${p.name}, ${p.address}` : p.name;
  if (IS_APPLE) return `https://maps.apple.com/?${new URLSearchParams({ q: query, ll: `${p.lat},${p.lng}` })}`;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: p.address ? query : `${p.lat},${p.lng}` })}`;
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

function Info({ place }: { place: PollPlace }) {
  const cuisine = place.cuisine ? cuisineLabel(place.cuisine) : null;
  return (
    <>
      {cuisine && (
        <p className="vote-cuisine">
          {cuisine.emoji} {cuisine.label}
        </p>
      )}
      <h2 className="vote-name">{place.name}</h2>
      {place.address && <p className="vote-address">{place.address}</p>}
    </>
  );
}

export function VotePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Mon vote (❤️ / ✕ par resto) : rempli carte après carte, puis envoyé.
  const [likes, setLikes] = useState<boolean[]>([]);
  // On refait le tour des cartes pour changer d'avis.
  const [revoting, setRevoting] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mine] = useState(() => ownPoll(pollId));

  const refresh = useCallback(async () => {
    try {
      const results = await apiResults(API_BASE, pollId, voterId());
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

  async function send(all: boolean[]) {
    setSending(true);
    setNotice(null);
    try {
      const results = await apiVote(API_BASE, pollId, voterId(), all);
      if (results === "expired") return setState({ kind: "gone" });
      setRevoting(false);
      setState({ kind: "ready", poll: results });
    } catch (err) {
      setNotice(String(err).includes("409") ? TEXT.full : TEXT.error);
    } finally {
      setLikes([]);
      setSending(false);
    }
  }

  function choose(like: boolean) {
    if (state.kind !== "ready") return;
    const all = [...likes, like];
    setLikes(all);
    if (all.length === state.poll.places.length) send(all);
  }

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

  const voting = state.kind === "ready" && (!state.poll.mine || revoting);

  return (
    <main className="vote">
      <a className="vote-brand" href="/">
        <img src="/icon-192.png" alt="" width={34} height={34} />
        Groubl
      </a>
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

      {state.kind === "ready" && (
        <>
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
          <p className="vote-sub">{voting ? `${TEXT.howTo} · ${timeLeft(state.poll.expiresAt)}` : timeLeft(state.poll.expiresAt)}</p>
          {notice && (
            <p className="vote-notice" role="status">
              {notice}
            </p>
          )}
          {!voting ? (
            <Standings
              poll={state.poll}
              onRevote={() => {
                setLikes([]);
                setNotice(null);
                setRevoting(true);
              }}
              onShare={() => shareResult(state.poll)}
            />
          ) : sending || likes.length >= state.poll.places.length ? (
            <p className="vote-sub">{TEXT.sending}</p>
          ) : (
            <Deck
              key={likes.length}
              place={state.poll.places[likes.length]}
              step={likes.length + 1}
              total={state.poll.places.length}
              onChoose={choose}
            />
          )}
        </>
      )}
    </main>
  );
}

/** Une carte à la fois : on la glisse (ou ✕ / ❤️). */
function Deck({ place, step, total, onChoose }: { place: PollPlace; step: number; total: number; onChoose: (like: boolean) => void }) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const start = useRef<number | null>(null);

  function fly(direction: "left" | "right") {
    setLeaving(direction);
    setTimeout(() => onChoose(direction === "right"), FLY_MS);
  }
  const down = (e: PointerEvent) => {
    start.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => start.current !== null && setDx(e.clientX - start.current);
  const up = () => {
    start.current = null;
    if (dx < -THRESHOLD) fly("left");
    else if (dx > THRESHOLD) fly("right");
    else setDx(0);
  };

  const x = leaving ? (leaving === "left" ? -1 : 1) * window.innerWidth * 1.3 : dx;
  return (
    <>
      <p className="vote-step">
        {step} / {total}
      </p>
      <div
        className="vote-card"
        style={{ transform: `translateX(${x}px) rotate(${x / 18}deg)`, transition: start.current === null ? `transform ${FLY_MS}ms ease-out` : "none" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <span className="vote-stamp vote-stamp-nope" style={{ opacity: Math.min(1, Math.max(0, -x / THRESHOLD)) }}>
          {TEXT.nope}
        </span>
        <span className="vote-stamp vote-stamp-yum" style={{ opacity: Math.min(1, Math.max(0, x / THRESHOLD)) }}>
          {TEXT.yum}
        </span>
        <Info place={place} />
      </div>
      <div className="vote-actions">
        <button className="vote-round" onClick={() => fly("left")} aria-label={TEXT.nope}>
          ✕
        </button>
        <button className="vote-round vote-heart" onClick={() => fly("right")} aria-label={TEXT.yum}>
          ❤️
        </button>
      </div>
    </>
  );
}

/** Où en est le groupe : les restos par nombre de ❤️, le premier avec son lien. */
function Standings({ poll, onRevote, onShare }: { poll: PollLive; onRevote: () => void; onShare: () => void }) {
  const ranked = ranking(poll);
  const best = Math.max(1, ranked[0].hearts);
  const top = winner(poll);
  return (
    <section className="vote-results">
      <p className="vote-kicker">
        {top ? TEXT.verdict : TEXT.leading} · {poll.voters === 1 ? TEXT.votes.one : fill(TEXT.votes.many, poll.voters)}
      </p>
      {ranked.map(({ place, hearts }, i) => (
        <div key={`${place.name}-${i}`} className={`vote-row${i === 0 && hearts > 0 ? " vote-row-top" : ""}`}>
          <div className="vote-row-head">
            <span className="vote-row-name">
              {top === place ? "🏆 " : ""}
              {place.name}
            </span>
            <span className="vote-row-hearts">❤️ {hearts}</span>
          </div>
          <div className="vote-bar">
            <div style={{ width: `${(hearts / best) * 100}%` }} />
          </div>
          {i === 0 && hearts > 0 && (
            <a className="vote-button" href={mapsUrl(place)} target="_blank" rel="noreferrer">
              {TEXT.go}
            </a>
          )}
        </div>
      ))}
      <button type="button" className="vote-button vote-button-ghost" onClick={onShare}>
        🏆 {TEXT.shareResult}
      </button>
      <button type="button" className="vote-link" onClick={onRevote}>
        {TEXT.revote}
      </button>
    </section>
  );
}
