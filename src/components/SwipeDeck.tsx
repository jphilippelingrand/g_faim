import { useRef, useState, type PointerEvent } from "react";
import { PlaceCard, shareRestaurant } from "./PlaceCard";
import { directionsUrl, distanceMeters, travelTime, type LatLng, type Restaurant } from "../lib/places";
import { t } from "../i18n";

type Props = {
  places: Restaurant[];
  home: LatLng;
  current: number;
  onChange: (index: number) => void;
};

// Au-delà de cette distance (px), la carte part ; sinon elle revient.
const THRESHOLD = 90;
const FLY_MS = 260;

/**
 * Le paquet de cartes, façon Tinder : à gauche, « nan », la suivante (et on reboucle après la dernière) ;
 * à droite, « miam », l'itinéraire. Les boutons ✕ et ♥ font la même chose, pour qui ne glisse pas.
 */
export function SwipeDeck({ places, home, current, onChange }: Props) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const start = useRef<number | null>(null);

  const place = places[current];
  const next = places[(current + 1) % places.length];
  const trip = travelTime(distanceMeters(home, place.location));
  const url = directionsUrl(home, place, trip.mode === "walk");

  function fly(direction: "left" | "right") {
    // Ouvert tout de suite, pendant le geste de l'utilisateur (sinon le navigateur bloque la fenêtre).
    if (direction === "right") window.open(url, "_blank", "noopener");
    setLeaving(direction);
    setTimeout(() => {
      setLeaving(null);
      setDx(0);
      if (direction === "left") onChange((current + 1) % places.length);
    }, FLY_MS);
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    start.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current !== null) setDx(e.clientX - start.current);
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (dx < -THRESHOLD) fly("left");
    else if (dx > THRESHOLD) fly("right");
    else setDx(0);
  };

  const offset = leaving === "left" ? -window.innerWidth * 1.2 : leaving === "right" ? window.innerWidth * 1.2 : dx;
  const dragging = start.current !== null;

  return (
    <div className="deck">
      <div className="deck-cards">
        {places.length > 1 && (
          <div className="deck-card behind" key={`behind-${next.id}`}>
            <PlaceCard r={next} home={home} distance={distanceMeters(home, next.location)} actions={false} />
          </div>
        )}
        <div
          key={place.id}
          className="deck-card"
          style={{
            transform: `translateX(${offset}px) rotate(${offset / 18}deg)`,
            transition: dragging ? "none" : `transform ${FLY_MS}ms ease-out`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <PlaceCard r={place} home={home} distance={distanceMeters(home, place.location)} actions={false} />
          <span className="stamp nope" style={{ opacity: Math.min(1, Math.max(0, -offset / THRESHOLD)) }}>
            {t("nope")}
          </span>
          <span className="stamp yum" style={{ opacity: Math.min(1, Math.max(0, offset / THRESHOLD)) }}>
            {t("yum")}
          </span>
        </div>
      </div>

      <div className="deck-actions">
        <button type="button" className="round nope" onClick={() => fly("left")} aria-label={t("next")}>
          ✕
        </button>
        <button type="button" className="round small" onClick={() => shareRestaurant(place, trip.minutes)} aria-label={t("share")}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="round yum" onClick={() => fly("right")} aria-label={t("directionsTo", { name: place.name })}>
          ♥
        </button>
      </div>
    </div>
  );
}
