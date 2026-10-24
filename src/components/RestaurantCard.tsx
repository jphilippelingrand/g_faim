import { formatDistance, type LatLng, type Restaurant } from "../lib/places";

type Props = {
  r: Restaurant;
  index: number;
  home: LatLng;
  distance: number;
  selected: boolean;
  onSelect: (id: string) => void;
};

// Au-delà, on laisse Google choisir le mode de transport.
const WALKING_MAX = 1500;

function directionsUrl(home: LatLng, r: Restaurant, distance: number): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${home.lat},${home.lng}`,
    destination: r.name,
    destination_place_id: r.id,
  });
  if (distance <= WALKING_MAX) params.set("travelmode", "walking");
  return `https://www.google.com/maps/dir/?${params}`;
}

export function RestaurantCard({ r, index, home, distance, selected, onSelect }: Props) {
  const details = [r.type, r.price, formatDistance(distance)].filter(Boolean).join(" · ");

  return (
    <li id={`resto-${r.id}`}>
      <div
        className={`card${selected ? " selected" : ""}`}
        style={{ animationDelay: `${index * 70}ms` }}
        onMouseEnter={() => onSelect(r.id)}
        onFocus={() => onSelect(r.id)}
      >
        <span className="rank">{index + 1}</span>
        <a className="card-link" href={r.url} target="_blank" rel="noopener noreferrer">
          {r.photo ? (
            <img className="thumb" src={r.photo} alt="" loading="lazy" />
          ) : (
            <div className="thumb">🍽️</div>
          )}
          <div>
            <h2>{r.name}</h2>
            <div className="meta">
              <span className="rating">
                <span className="star">★</span> {r.rating.toFixed(1)}
              </span>{" "}
              · {r.reviews} avis
            </div>
            <div className="meta">{details}</div>
          </div>
        </a>
        <a
          className="go"
          href={directionsUrl(home, r, distance)}
          target="_blank"
          rel="noopener noreferrer"
          title="Itinéraire"
          aria-label={`Itinéraire vers ${r.name}`}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M21.7 11.3l-9-9a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4zM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5z" fill="currentColor" />
          </svg>
        </a>
      </div>
    </li>
  );
}
