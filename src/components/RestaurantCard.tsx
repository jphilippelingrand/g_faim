import { formatClosingTime, formatDistance, travelTime, type LatLng, type Restaurant } from "../lib/places";
import { cuisineLabel } from "../lib/osm";
import { t } from "../i18n";

type Props = {
  r: Restaurant;
  index: number;
  home: LatLng;
  distance: number;
  selected: boolean;
  onSelect: (id: string) => void;
};

// En dessous, on prévient que ça ferme bientôt.
const CLOSING_SOON = 60;

/** Lien d'itinéraire Google Maps (une simple URL, pas l'API : gratuit). */
function directionsUrl(home: LatLng, r: Restaurant, walking: boolean): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${home.lat},${home.lng}`,
    destination: `${r.location.lat},${r.location.lng}`,
    travelmode: walking ? "walking" : "driving",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

function openingLine(r: Restaurant): { text: string; soon: boolean } {
  if (r.closesIn === undefined) return { text: t("hoursUnknown"), soon: false };
  if (r.closesIn === Infinity) return { text: t("openAllDay"), soon: false };
  return { text: t("openUntil", { time: formatClosingTime(r.closesIn) }), soon: r.closesIn < CLOSING_SOON };
}

const WALKER = "M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 13v-2a5 5 0 0 1-4.3-2.4l-1-1.6a2 2 0 0 0-1.7-1c-.3 0-.5 0-.8.1L6 8.3V13h2V9.6l1.8-.7";
const CAR = "M18.9 6c-.2-.6-.8-1-1.4-1h-11c-.7 0-1.2.4-1.4 1L3 12v8c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h12v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-8l-2.1-6zM6.5 16c-.8 0-1.5-.7-1.5-1.5S5.7 13 6.5 13s1.5.7 1.5 1.5S7.3 16 6.5 16zm11 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z";

export function RestaurantCard({ r, index, home, distance, selected, onSelect }: Props) {
  const cuisine = r.cuisine ? cuisineLabel(r.cuisine) : null;
  const opening = openingLine(r);
  const trip = travelTime(distance);
  const url = directionsUrl(home, r, trip.mode === "walk");
  const tripLabel = t(trip.mode === "walk" ? "walkMinutes" : "driveMinutes", { minutes: trip.minutes });

  return (
    <li id={`resto-${r.id}`}>
      <div
        className={`card${selected ? " selected" : ""}`}
        style={{ animationDelay: `${index * 70}ms` }}
        // Souris uniquement : sur mobile, le début d'un scroll déclencherait la sélection.
        onPointerEnter={(e) => e.pointerType === "mouse" && onSelect(r.id)}
      >
        <a className="card-link" href={url} target="_blank" rel="noopener noreferrer">
          <span className="rank" aria-hidden="true">{index + 1}</span>
          <div className="card-body">
            <h2>{r.name}</h2>
            {cuisine && (
              <div className="meta meta-line">
                {cuisine.emoji} {cuisine.label}
              </div>
            )}
            <div className={`meta${r.open === undefined ? " unknown" : opening.soon ? " soon" : " open"}`}>{opening.text}</div>
          </div>
        </a>
        <a
          className="go"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={t("directions")}
          aria-label={`${t("directionsTo", { name: r.name })} : ${tripLabel}, ${formatDistance(distance)}`}
        >
          <span className="eta">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d={trip.mode === "walk" ? WALKER : CAR} fill="currentColor" />
            </svg>
            <b>{trip.minutes}</b>
            <span>min</span>
          </span>
          <span className="dist">{formatDistance(distance)}</span>
        </a>
      </div>
    </li>
  );
}
