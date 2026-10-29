import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Lady } from "./components/Lady";
import { PlaceCard } from "./components/PlaceCard";
import { SwipeDeck } from "./components/SwipeDeck";
import { getMapsApp, IS_APPLE, setMapsApp } from "./lib/mapsApp";
import { LANGS, lang, setLang, t } from "./i18n";
import {
  distanceMeters,
  formatDistance,
  geocode,
  getBrowserPosition,
  nearestOpen,
  nearestOpenInView,
  type Area,
  type LatLng,
  type Restaurant,
} from "./lib/places";

// La carte (MapLibre) pèse lourd : chargée à part, pendant qu'on cherche la position.
const RestaurantMap = lazy(() => import("./components/RestaurantMap").then((m) => ({ default: m.RestaurantMap })));

type Phase = "locating" | "searching" | "done" | "error";

// Grand écran : la fiche est un panneau à gauche, la carte se cadre à sa droite.
const WIDE = "(min-width: 900px)";
const PANEL_WIDTH = 452;

/**
 * Carte plein écran et, en bas, une fiche par resto : le plus proche d'abord, on glisse pour le suivant.
 * La carte suit la fiche affichée. La dame ne prend toute la place que pendant la recherche ou quand il n'y a rien.
 */
export default function App() {
  const [home, setHome] = useState<LatLng | null>(null);
  const [top, setTop] = useState<Restaurant[]>([]);
  const [area, setArea] = useState<Area | null>(null);
  const [current, setCurrent] = useState(0);
  // Incrémenté quand la carte doit se recadrer sur toi + la fiche affichée.
  const [fitKey, setFitKey] = useState(0);
  const [phase, setPhase] = useState<Phase>("locating");
  const [error, setError] = useState<string | null>(null);
  // Si la géoloc est refusée, on propose de taper une adresse à la place.
  const [askAddress, setAskAddress] = useState(false);
  const [address, setAddress] = useState("");

  const sheetRef = useRef<HTMLDivElement>(null);
  // Mobile : le paquet de cartes à glisser. Grand écran : la liste des 5, à gauche.
  const [isWide, setIsWide] = useState(() => window.matchMedia(WIDE).matches);
  // Ce que la fiche cache de la carte : la carte se cadre dans le reste.
  const [insets, setInsets] = useState({ bottom: 0, left: 0 });
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const wide = window.matchMedia(WIDE);
    const measure = () => {
      setIsWide(wide.matches);
      setInsets(wide.matches ? { bottom: 0, left: PANEL_WIDTH } : { bottom: sheet.offsetHeight, left: 0 });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    wide.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      wide.removeEventListener("change", measure);
    };
  }, []);

  // Dès l'ouverture : on récupère la position.
  useEffect(() => {
    let cancelled = false;
    getBrowserPosition()
      .then((pos) => !cancelled && setHome(pos))
      .catch((err: Error) => {
        if (cancelled) return;
        setPhase("error");
        setError(`${err.message} ${t("askAddress")}`);
        setAskAddress(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Seule la dernière recherche lancée a le droit d'afficher ses résultats.
  const requestId = useRef(0);
  const run = useCallback(async (search: () => Promise<{ list: Restaurant[]; area: Area }>, refit: boolean) => {
    const id = ++requestId.current;
    setPhase("searching");
    setError(null);
    try {
      const { list, area } = await search();
      if (id !== requestId.current) return;
      setTop(list);
      setArea(area);
      setCurrent(0);
      if (refit) setFitKey((k) => k + 1);
      setPhase("done");
    } catch (err) {
      if (id !== requestId.current) return;
      console.error(err);
      setPhase("error");
      setError((err as Error).message || t("oops"));
    }
  }, []);

  // Position connue : les 5 restos ouverts les plus proches, la carte cadrée sur toi et le premier.
  const searchAroundHome = useCallback(() => home && run(() => nearestOpen(home), true), [home, run]);
  useEffect(() => {
    searchAroundHome();
  }, [searchAroundHome]);

  const restart = () => {
    getBrowserPosition()
      .then((pos) => setHome(pos))
      .catch(() => searchAroundHome());
  };

  // L'utilisateur déplace ou zoome la carte : les 5 plus proches du centre, sans la recadrer.
  const onViewportChange = useCallback((view: Area) => run(() => nearestOpenInView(view), false), [run]);

  // Une autre fiche (glissée, cliquée, ou son épingle touchée) : la carte la suit.
  const show = useCallback((index: number) => {
    if (index < 0) return;
    setCurrent(index);
    setFitKey((k) => k + 1);
  }, []);
  const onSelectFromMap = useCallback((id: string) => show(top.findIndex((r) => r.id === id)), [show, top]);

  // Sur iPhone : l'appli de cartes retenue, qu'on peut changer en bas de l'écran.
  const [mapsApp, setMapsAppState] = useState(getMapsApp);
  const switchMapsApp = () => {
    const next = mapsApp === "apple" ? "google" : "apple";
    setMapsApp(next);
    setMapsAppState(next);
  };

  const busy = phase === "locating" || phase === "searching";
  const empty = phase === "done" && !top.length;
  const firstSearch = busy && !top.length;

  let status = "";
  if (phase === "locating") status = t("locating");
  else if (phase === "error") status = error ?? "";
  else if (empty) status = t("nothingOpen");

  async function submitAddress(e: FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    try {
      setPhase("locating");
      setHome(await geocode(address.trim()));
      setAskAddress(false);
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }

  return (
    <div className="shell">
      {home ? (
        <Suspense fallback={<div className="map" />}>
          <RestaurantMap
            home={home}
            results={top}
            area={area}
            fitKey={fitKey}
            selectedId={top[current]?.id ?? null}
            insets={insets}
            onSelect={onSelectFromMap}
            onViewportChange={onViewportChange}
          >
            {!busy && area && <span className="pill">{formatDistance(area.radius)}</span>}
            {area && distanceMeters(area.center, home) > 50 && (
              <button type="button" className="pill pill-button" onClick={searchAroundHome}>
                {t("aroundMe")}
              </button>
            )}
          </RestaurantMap>
        </Suspense>
      ) : (
        <div className="map" />
      )}

      {/* Le logo repart de zéro : on reprend la position (on a pu bouger) et on recherche autour de soi. */}
      <button type="button" className={`brand${busy ? " busy" : ""}`} onClick={restart} aria-label={t("restart")}>
        <img src="/icon.svg" alt="" />
        {t("appName")}
      </button>

      {/* La dame : en grand pendant la première recherche, quand rien n'est ouvert, ou sans position. */}
      {(firstSearch || empty || phase === "error") && (
        <div className="stage">
          <div className="stage-backdrop" />
          <Lady mood={busy ? "starving" : "hungry"} />
        </div>
      )}

      <div className="sheet" ref={sheetRef}>
        {status && (
          <p className={`status${phase === "error" ? " error" : ""}`} role="status">
            {status}
          </p>
        )}

        {askAddress && (
          <form className="address" onSubmit={submitAddress}>
            <input
              type="text"
              placeholder={t("addressPlaceholder")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoFocus
            />
            <button type="submit">{t("go")}</button>
          </form>
        )}

        {home && top.length > 0 && (
          <>
            {isWide ? (
              <ol className={`list${busy ? " stale" : ""}`}>
                {top.map((r, i) => (
                  <li key={r.id} className={i === current ? "current" : undefined} onClick={() => show(i)}>
                    <PlaceCard r={r} home={home} distance={distanceMeters(home, r.location)} />
                  </li>
                ))}
              </ol>
            ) : (
              <div className={busy ? "stale" : undefined}>
                <SwipeDeck places={top} home={home} current={current} onChange={show} onMapsApp={setMapsAppState} />
              </div>
            )}
          </>
        )}

        <nav className="legal" aria-label={t("language")}>
          <a href={`/${lang}/privacy`}>{t("privacy")}</a>
          {IS_APPLE && (
            <button type="button" onClick={switchMapsApp}>
              {t("mapsWith", { app: mapsApp === "google" ? "Google Maps" : mapsApp === "apple" ? "Plans" : "…" })}
            </button>
          )}
          {LANGS.map((l) => (
            <button key={l} type="button" aria-current={l === lang} onClick={() => l !== lang && setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
