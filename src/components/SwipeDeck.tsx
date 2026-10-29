import { useRef, useState, type PointerEvent } from "react";
import { PlaceCard, shareRestaurant } from "./PlaceCard";
import { distanceMeters, travelTime, type LatLng, type Restaurant } from "../lib/places";
import { directionsUrl, getMapsApp, IS_APPLE, openDirections, setMapsApp, type MapsApp } from "../lib/mapsApp";
import { t } from "../i18n";

type Props = {
  places: Restaurant[];
  home: LatLng;
  current: number;
  onChange: (index: number) => void;
  /** Appli de cartes choisie la première fois (pour l'afficher en bas de l'écran). */
  onMapsApp: (app: MapsApp) => void;
};

// Au-delà de cette distance (px), la carte part ; sinon elle revient.
const THRESHOLD = 90;
const FLY_MS = 260;
const TAP_SLOP = 6;

/**
 * Le paquet de cartes, façon Tinder : à gauche, « nan », la suivante (et on reboucle après la dernière) ;
 * à droite (ou un simple tap), « miam », l'itinéraire. Les boutons ✕ et ♥ font la même chose, pour qui ne glisse pas.
 */
export function SwipeDeck({ places, home, current, onChange, onMapsApp }: Props) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  // Sur iPhone, la première fois qu'on y va : « Ouvrir avec Plans ou Google Maps ? »
  const [choosing, setChoosing] = useState(false);
  const start = useRef<number | null>(null);
  // Un geste qui n'a presque pas bougé est un simple tap : on y va, comme ♥.
  const moved = useRef(false);

  const place = places[current];
  const next = places[(current + 1) % places.length];
  const trip = travelTime(distanceMeters(home, place.location));

  const go = (app?: MapsApp) => openDirections(directionsUrl(home, place, trip.mode === "walk", app));

  function fly(direction: "left" | "right") {
    if (direction === "right" && !getMapsApp()) {
      setDx(0);
      setChoosing(true);
      return;
    }
    // Hors iPhone, le nouvel onglet doit s'ouvrir pendant le geste lui-même, sinon le navigateur le bloque.
    if (direction === "right" && !IS_APPLE) go();
    setLeaving(direction);
    setTimeout(() => {
      // Sur iPhone : dans le même onglet, une fois la carte partie ; elle revient pour le retour arrière.
      if (direction === "right" && IS_APPLE) go();
      setLeaving(null);
      setDx(0);
      if (direction === "left") onChange((current + 1) % places.length);
    }, FLY_MS);
  }

  const choose = (app: MapsApp) => {
    setMapsApp(app);
    onMapsApp(app);
    setChoosing(false);
    go(app);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    start.current = e.clientX;
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    if (Math.abs(e.clientX - start.current) > TAP_SLOP) moved.current = true;
    setDx(e.clientX - start.current);
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (!moved.current) fly("right");
    else if (dx < -THRESHOLD) fly("left");
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

      {choosing && (
        <div className="maps-choice" role="dialog" aria-label={t("openWith")}>
          <p>{t("openWith")}</p>
          <button type="button" onClick={() => choose("apple")}>
            Plans
          </button>
          <button type="button" onClick={() => choose("google")}>
            Google Maps
          </button>
        </div>
      )}

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
