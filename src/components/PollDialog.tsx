import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { lang, t } from "../i18n";
import { placeUrl } from "../lib/mapsApp";
import { cuisineLabel } from "../lib/osm";
import { byName, distanceMeters, formatDistance, inView, nearest, type Box, type LatLng, type Restaurant } from "../lib/places";
import { createPoll, myPolls, POLL_MAX, POLL_MIN, POLL_TTLS, type PollTtl } from "../lib/polls";

type Props = {
  /** Les restos déjà trouvés (ouverts) : affichés le temps de charger ceux d'à côté, fermés compris. */
  places: Restaurant[];
  home: LatLng;
  /** Le resto affiché : coché d'office. */
  preselected?: string;
  onClose: () => void;
};

// La carte (MapLibre) pèse lourd : chargée à part, à l'ouverture de la fenêtre.
const PollMap = lazy(() => import("./PollMap").then((m) => ({ default: m.PollMap })));

// Restos proposés à l'ouverture, le temps que la carte donne sa zone visible.
const PAGE = 20;

const TEXT = {
  fr: {
    title: "On mange où ?",
    running: "Mes votes",
    over: "terminé",
    howTo: "Coche {min} à {max} restos : tes copains votent, le groupe décide.",
    ttl: "Le vote reste ouvert",
    ttls: { "1h": "1 heure", "1d": "1 jour", "1w": "1 semaine" },
    create: "Créer le vote ({n})",
    close: "Fermer",
    error: "Oups, quelque chose a coincé. Réessaie dans un instant.",
    closedNow: "fermé en ce moment",
    onMaps: "Voir dans Maps",
  },
  en: {
    title: "Where should we eat?",
    running: "My votes",
    over: "over",
    howTo: "Pick {min} to {max} places: your friends vote, the group decides.",
    ttl: "Voting stays open for",
    ttls: { "1h": "1 hour", "1d": "1 day", "1w": "1 week" },
    create: "Create the vote ({n})",
    close: "Close",
    error: "Oops, something went wrong. Try again in a moment.",
    closedNow: "closed right now",
    onMaps: "Open in Maps",
  },
  es: {
    title: "¿Dónde comemos?",
    running: "Mis votaciones",
    over: "terminada",
    howTo: "Marca de {min} a {max} sitios: tus amigos votan, el grupo decide.",
    ttl: "La votación queda abierta",
    ttls: { "1h": "1 hora", "1d": "1 día", "1w": "1 semana" },
    create: "Crear la votación ({n})",
    close: "Cerrar",
    error: "Uy, algo ha fallado. Inténtalo de nuevo en un momento.",
    closedNow: "cerrado ahora",
    onMaps: "Ver en Maps",
  },
}[lang];

/**
 * « On mange où ? » sur le site : ses votes en cours (vers leur page), et un nouveau : on coche 2 à 5 restos,
 * on choisit la durée, et on arrive sur la page du vote (lien à copier, résultats, suppression). Comme la
 * feuille 🧑‍🤝‍🧑 de l'app : la carte des restos autour (cochés en corail), une recherche par nom, et la liste,
 * ses restos cochés en tête : tous les restos de la zone visible de la carte, la liste suit quand on la
 * déplace (les cochés restent). On vote souvent pour plus tard : la liste prend tous les restos autour, même
 * fermés en ce moment (c'est indiqué).
 * La case coche (la carte cadre alors tous les cochés) ; survoler une ligne grossit son resto sur la carte,
 * cliquer dessus y emmène la carte ; un point touché sur la carte, la liste va à sa ligne.
 */
export function PollDialog({ places, home, preselected, onClose }: Props) {
  // Les restos cochés eux-mêmes (pas seulement leur identifiant) : ils restent cochés quand la liste change de zone.
  const [picked, setPicked] = useState<Restaurant[]>(() => places.filter((r) => r.id === preselected));
  // Le resto survolé ou cliqué dans la liste (ou touché sur la carte) ; `fly` : la carte va dessus.
  const [focus, setFocus] = useState<{ id: string; fly: boolean } | null>(null);
  const [ttl, setTtl] = useState<PollTtl>("1h");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [running] = useState(myPolls);
  const [choices, setChoices] = useState(places);
  const listRef = useRef<HTMLUListElement>(null);
  // Seule la dernière recherche lancée a le droit d'afficher ses résultats.
  const requestId = useRef(0);

  const load = (find: () => Promise<Restaurant[]>) => {
    const id = ++requestId.current;
    find()
      .then((found) => id === requestId.current && setChoices(found))
      .catch(console.error);
  };
  // À l'ouverture : les plus proches, fermés compris, de quoi cadrer la carte. Ensuite, c'est la carte qui
  // décide (showView).
  useEffect(() => {
    load(() => nearest(home, PAGE).then((found) => found.list));
  }, [home]);

  // La recherche par nom : tant qu'elle est tapée, la liste et la carte montrent ses résultats (la carte les
  // cadre), plus la zone visible. Effacée, on revient à la zone visible.
  const [query, setQuery] = useState("");
  // La dernière réponse reçue, avec ce qui avait été tapé : on garde la précédente le temps que la suivante arrive.
  const [result, setResult] = useState<{ text: string; list: Restaurant[] } | null>(null);
  const text = query.trim();
  const active = text.length >= 2;
  const found = active ? (result?.list ?? []) : null;
  const searching = active && result?.text !== text;
  useEffect(() => {
    if (!active) return;
    let stale = false;
    // Un petit temps après la dernière lettre : pas une recherche par touche.
    const timer = setTimeout(() => {
      byName(text, home)
        .then((list) => !stale && setResult({ text, list }))
        .catch((err) => {
          console.error(err);
          if (!stale) setResult({ text, list: [] });
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [active, text, home]);

  // La carte s'est arrêtée : tous les restos de la zone visible, du plus proche au plus loin de soi. La carte
  // et la liste montrent ainsi la même chose (sauf pendant une recherche par nom).
  const showView = (box: Box) => {
    if (!active) load(() => inView(box, home));
  };

  const listed = found ?? choices;
  const isPicked = (id: string) => picked.some((r) => r.id === id);
  // Les restos cochés en tête de liste (dans l'ordre où on les a cochés), les autres suivent.
  const ordered = [...picked, ...listed.filter((r) => !isPicked(r.id))];

  // La case : cochée ou décochée (la carte cadre alors tous les cochés).
  const toggle = (r: Restaurant) => {
    setPicked((p) => (p.some((x) => x.id === r.id) ? p.filter((x) => x.id !== r.id) : p.length < POLL_MAX ? [...p, r] : p));
    setFocus(null);
  };
  // Un point touché sur la carte : la liste va à sa ligne.
  const focusFromMap = (id: string) => {
    setFocus({ id, fly: false });
    listRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  async function create() {
    setBusy(true);
    setError(false);
    try {
      // Du plus proche au plus loin, pas dans l'ordre des coches.
      const chosen = [...picked]
        .sort((a, b) => distanceMeters(home, a.location) - distanceMeters(home, b.location))
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
                  {p.expiresAt <= Date.now() && <span className="poll-over"> · {TEXT.over}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        <Suspense fallback={<div className="poll-map" />}>
          <PollMap
            home={home}
            places={listed}
            picked={picked}
            focus={focus}
            onSelect={focusFromMap}
            onView={showView}
            frame={found ?? undefined}
          />
        </Suspense>

        <div className="poll-search">
          <span className="poll-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("pollSearch")}
            aria-label={t("pollSearch")}
            autoComplete="off"
            spellCheck={false}
          />
          {searching ? (
            <span className="poll-spinner" aria-hidden="true" />
          ) : (
            query.length > 0 && (
              <button type="button" className="poll-search-clear" onClick={() => setQuery("")} aria-label={TEXT.close}>
                ✕
              </button>
            )
          )}
        </div>

        {found === null && <p className="poll-how">{TEXT.howTo.replace("{min}", String(POLL_MIN)).replace("{max}", String(POLL_MAX))}</p>}
        {found && !searching && !found.length && <p className="poll-how">{t("pollNoMatch")}</p>}
        <ul className="poll-places" ref={listRef}>
          {ordered.map((r) => {
            const cuisine = r.cuisine ? cuisineLabel(r.cuisine) : null;
            const on = isPicked(r.id);
            return (
              // Survolée, la ligne grossit son resto sur la carte ; cliquée, la carte y va ; la case le coche.
              <li
                key={r.id}
                data-id={r.id}
                className={focus?.id === r.id ? "focused" : undefined}
                onMouseEnter={() => setFocus({ id: r.id, fly: false })}
              >
                <input
                  type="checkbox"
                  aria-label={r.name}
                  checked={on}
                  disabled={!on && picked.length >= POLL_MAX}
                  onChange={() => toggle(r)}
                />
                <button type="button" className="poll-place-main" onClick={() => setFocus({ id: r.id, fly: true })}>
                  <span className="poll-place-name">{r.name}</span>
                  <span className="poll-place-info">
                    {[cuisine && `${cuisine.emoji} ${cuisine.label}`, formatDistance(distanceMeters(home, r.location)), r.open === false && TEXT.closedNow]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                {/* Sa fiche dans Maps (avis, photos, horaires), dans un nouvel onglet. */}
                <a
                  className="poll-maps"
                  href={placeUrl({ name: r.name, address: r.address, ...r.location })}
                  target="_blank"
                  rel="noreferrer"
                  title={TEXT.onMaps}
                  aria-label={`${TEXT.onMaps} : ${r.name}`}
                >
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path d="M6 3H3v10h10v-3M9 2.5h4.5V7M13.5 2.5 7.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Maps</span>
                </a>
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
