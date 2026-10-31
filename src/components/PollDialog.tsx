import { useState } from "react";
import { lang } from "../i18n";
import { cuisineLabel } from "../lib/osm";
import type { Restaurant } from "../lib/places";
import { createPoll, myPolls, POLL_MAX, POLL_MIN, POLL_TTLS, type PollTtl } from "../lib/polls";

type Props = {
  places: Restaurant[];
  /** Le resto affiché : coché d'office. */
  preselected?: string;
  onClose: () => void;
};

const TEXT = {
  fr: {
    title: "On mange où ?",
    running: "Mes votes en cours",
    howTo: "Coche {min} à {max} restos : tes copains swipent, le groupe décide.",
    ttl: "Le vote reste ouvert",
    ttls: { "1h": "1 heure", "1d": "1 jour", "1w": "1 semaine" },
    create: "Créer le vote ({n})",
    close: "Fermer",
    error: "Oups, quelque chose a coincé. Réessaie dans un instant.",
  },
  en: {
    title: "Where should we eat?",
    running: "My running votes",
    howTo: "Pick {min} to {max} places: your friends swipe, the group decides.",
    ttl: "Voting stays open for",
    ttls: { "1h": "1 hour", "1d": "1 day", "1w": "1 week" },
    create: "Create the vote ({n})",
    close: "Close",
    error: "Oops, something went wrong. Try again in a moment.",
  },
  es: {
    title: "¿Dónde comemos?",
    running: "Mis votaciones en curso",
    howTo: "Marca de {min} a {max} sitios: tus amigos deslizan, el grupo decide.",
    ttl: "La votación queda abierta",
    ttls: { "1h": "1 hora", "1d": "1 día", "1w": "1 semana" },
    create: "Crear la votación ({n})",
    close: "Cerrar",
    error: "Uy, algo ha fallado. Inténtalo de nuevo en un momento.",
  },
}[lang];

/**
 * « On mange où ? » sur le site : ses votes en cours (vers leur page), et un nouveau : on coche 2 à 5 restos,
 * on choisit la durée, et on arrive sur la page du vote (lien à copier, résultats, suppression). Comme la
 * feuille 🧑‍🤝‍🧑 de l'app.
 */
export function PollDialog({ places, preselected, onClose }: Props) {
  const [picked, setPicked] = useState<string[]>(preselected ? [preselected] : []);
  const [ttl, setTtl] = useState<PollTtl>("1h");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [running] = useState(myPolls);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < POLL_MAX ? [...p, id] : p));

  async function create() {
    setBusy(true);
    setError(false);
    try {
      // Dans l'ordre de la liste (du plus proche au plus loin), pas dans l'ordre des coches.
      const chosen = places
        .filter((r) => picked.includes(r.id))
        .map((r) => ({ name: r.name, cuisine: r.cuisine, address: r.address, lat: r.location.lat, lng: r.location.lng }));
      const poll = await createPoll(chosen, ttl, lang);
      location.assign(`/v/${poll.id}`);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="poll-backdrop" onClick={onClose}>
      <div className="poll-dialog" role="dialog" aria-modal="true" aria-label={TEXT.title} onClick={(e) => e.stopPropagation()}>
        <div className="poll-head">
          <h2>{TEXT.title}</h2>
          <button type="button" className="poll-close" onClick={onClose} aria-label={TEXT.close}>
            ✕
          </button>
        </div>

        {running.length > 0 && (
          <>
            <p className="poll-section">{TEXT.running}</p>
            <ul className="poll-running">
              {running.map((p) => (
                <li key={p.id}>
                  <a href={`/v/${p.id}`}>{p.names.join(" · ")}</a>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="poll-how">{TEXT.howTo.replace("{min}", String(POLL_MIN)).replace("{max}", String(POLL_MAX))}</p>
        <ul className="poll-places">
          {places.map((r) => {
            const cuisine = r.cuisine ? cuisineLabel(r.cuisine) : null;
            const on = picked.includes(r.id);
            return (
              <li key={r.id}>
                <label className={on ? "on" : undefined}>
                  <input type="checkbox" checked={on} disabled={!on && picked.length >= POLL_MAX} onChange={() => toggle(r.id)} />
                  <span className="poll-place-name">{r.name}</span>
                  {cuisine && (
                    <span className="poll-place-info">
                      {cuisine.emoji} {cuisine.label}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>

        <p className="poll-section">{TEXT.ttl}</p>
        <div className="poll-ttls" role="radiogroup" aria-label={TEXT.ttl}>
          {POLL_TTLS.map((value) => (
            <button key={value} type="button" role="radio" aria-checked={ttl === value} className={ttl === value ? "on" : undefined} onClick={() => setTtl(value)}>
              {TEXT.ttls[value]}
            </button>
          ))}
        </div>

        {error && <p className="poll-error">{TEXT.error}</p>}
        <button type="button" className="poll-create" disabled={picked.length < POLL_MIN || busy} onClick={create}>
          {TEXT.create.replace("{n}", String(picked.length))}
        </button>
      </div>
    </div>
  );
}
