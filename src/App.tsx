import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Lady, type Mood } from "./components/Lady";
import { RestaurantCard } from "./components/RestaurantCard";
import { MiniBar } from "./components/MiniBar";
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

export default function App() {
  const [home, setHome] = useState<LatLng | null>(null);
  const [top, setTop] = useState<Restaurant[]>([]);
  const [area, setArea] = useState<Area | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Quand la grande dame sort de l'écran, une barre compacte prend le relais en haut.
  const heroRef = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>("locating");
  const [error, setError] = useState<string | null>(null);
  // Si la géoloc est refusée, on propose de taper une adresse à la place.
  const [askAddress, setAskAddress] = useState(false);
  const [address, setAddress] = useState("");

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
      setSelectedId(null);
      if (refit) setFitKey((k) => k + 1);
      setPhase("done");
    } catch (err) {
      if (id !== requestId.current) return;
      console.error(err);
      setPhase("error");
      setError((err as Error).message || t("oops"));
    }
  }, []);

  // Position connue : les 5 restos ouverts les plus proches, puis on cadre la carte dessus.
  const searchAroundHome = useCallback(() => home && run(() => nearestOpen(home), true), [home, run]);
  useEffect(() => {
    searchAroundHome();
  }, [searchAroundHome]);

  // La carte bouge : les 5 plus proches du centre, dans la zone visible.
  const onViewportChange = useCallback((view: Area) => run(() => nearestOpenInView(view), false), [run]);

  const onSelectFromMap = useCallback((id: string) => {
    setSelectedId(id);
    document.getElementById(`resto-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const busy = phase === "locating" || phase === "searching";
  const mood: Mood = busy ? "starving" : phase === "done" && top.length ? "happy" : "hungry";

  // Ligne de texte seulement quand il y a quelque chose à dire ; sinon, le rayon est une étiquette sur la carte.
  let status = "";
  if (phase === "locating") status = t("locating");
  else if (phase === "error") status = error ?? "";
  else if (phase === "done" && !top.length) status = t("nothingOpen");

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
    <>
      <MiniBar watch={heroRef} />
      <main>
        <header ref={heroRef}>
          <Lady mood={mood} />
          <p className="tagline">{t("tagline")}</p>
        </header>

        {home && (
          <Suspense
            fallback={
              <div className="map-wrap">
                <div className="map" />
              </div>
            }
          >
            <RestaurantMap
              home={home}
              results={top}
              area={area}
              fitKey={fitKey}
              selectedId={selectedId}
              onSelect={onSelectFromMap}
              onViewportChange={onViewportChange}
            >
              {busy ? (
                <span className="pill">{t("sniffing")}</span>
              ) : (
                area && <span className="pill">{formatDistance(area.radius)}</span>
              )}
              {area && home && distanceMeters(area.center, home) > 50 && (
                <button type="button" className="pill pill-button" onClick={searchAroundHome}>
                  {t("aroundMe")}
                </button>
              )}
            </RestaurantMap>
          </Suspense>
        )}

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
          <ol className={`results${busy ? " stale" : ""}`}>
            {top.map((r, i) => (
              <RestaurantCard
                key={r.id}
                r={r}
                index={i}
                home={home}
                distance={distanceMeters(home, r.location)}
                selected={r.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </ol>
        )}
      </main>

      <footer>
        {t("footerData")}{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>{" "}
        · {t("footerPoke")} · <a href={`/${lang}/privacy`}>{t("privacy")}</a>
        <nav className="langs" aria-label={t("language")}>
          {LANGS.map((l) => (
            <button key={l} type="button" aria-current={l === lang} onClick={() => l !== lang && setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </nav>
      </footer>
    </>
  );
}
