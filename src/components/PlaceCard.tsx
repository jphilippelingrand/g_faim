import { formatClosingTime, formatDistance, shareUrl, travelTime, type LatLng, type Restaurant } from "../lib/places";
import { directionsUrl } from "../lib/mapsApp";
import { cuisineLabel } from "../lib/osm";
import { t } from "../i18n";

type Props = {
  r: Restaurant;
  home: LatLng;
  distance: number;
  /** Le bouton « Y aller » et le partage (dans le paquet de cartes, ce sont les boutons du paquet). */
  actions?: boolean;
};

// En dessous, l'heure de fermeture passe au rouge.
const CLOSING_SOON = 60;

const LINES = ["verdict1", "verdict2", "verdict3", "verdict4", "verdict5"] as const;

/** Une phrase du ventre par resto, toujours la même pour lui. */
function lineFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return LINES[Math.abs(hash) % LINES.length];
}

/** Envoie le resto aux copains (feuille de partage, sinon presse-papiers). */
export async function shareRestaurant(r: Restaurant, minutes: number) {
  const text = t("shareText", { name: r.name, minutes });
  try {
    if (navigator.share) await navigator.share({ text, url: shareUrl(r) });
    else await navigator.clipboard.writeText(`${text} ${shareUrl(r)}`);
  } catch {
    // Partage annulé : rien à faire.
  }
}

/**
 * Une carte, style étiquette un peu rétro : une phrase du ventre, le nom en grand, une ligne d'infos,
 * et le temps pour y aller.
 */
export function PlaceCard({ r, home, distance, actions = true }: Props) {
  const trip = travelTime(distance);
  const cuisine = r.cuisine ? cuisineLabel(r.cuisine) : null;
  const closing =
    r.closesIn === undefined ? null : r.closesIn === Infinity ? t("openAllDay") : t("until", { time: formatClosingTime(r.closesIn) });
  const soon = r.closesIn !== undefined && r.closesIn < CLOSING_SOON;

  return (
    <article className="place">
      <p className="place-line">{t(lineFor(r.id))}</p>
      <h2>{r.name}</h2>
      <p className="place-info">
        {[cuisine && `${cuisine.emoji} ${cuisine.label}`, formatDistance(distance)].filter(Boolean).join(" · ")}
        {closing && (
          <>
            {" · "}
            <span className={soon ? "soon" : undefined}>{closing}</span>
          </>
        )}
      </p>
      <p className="place-time" aria-label={t(trip.mode === "walk" ? "walkMinutes" : "driveMinutes", { minutes: trip.minutes })}>
        {trip.mode === "walk" ? "🚶" : "🚗"} <b>{trip.minutes}</b> min
      </p>
      {actions && (
        <div className="place-actions">
          <a className="go" href={directionsUrl(home, r, trip.mode === "walk")} target="_blank" rel="noopener noreferrer">
            {t("go")}
          </a>
          <button type="button" className="share" onClick={() => shareRestaurant(r, trip.minutes)} aria-label={t("share")}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </article>
  );
}
