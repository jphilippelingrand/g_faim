import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Lady, type Mood } from "./components/Lady";
import { RestaurantCard } from "./components/RestaurantCard";
import { RestaurantMap } from "./components/RestaurantMap";
import { MiniBar } from "./components/MiniBar";
import { ShuffleToggle } from "./components/ShuffleToggle";
import { hasApiKey } from "./lib/google";
import { neighborhoodCategories, type Category } from "./lib/osm";
import { LANGS, lang, setLang, t } from "./i18n";
import {
  distanceMeters,
  formatDistance,
  geocode,
  getBrowserPosition,
  pickRandom,
  rankTop,
  searchRestaurants,
  searchUntilTop,
  type Area,
  type LatLng,
  type Restaurant,
} from "./lib/places";

type Phase = "locating" | "searching" | "done" | "error";

// En dessous de cette fraction de la zone fouillée, un zoom avant relance la recherche.
const ZOOM_IN_RATIO = 0.6;

export default function App() {
  const [home, setHome] = useState<LatLng | null>(null);
  const [places, setPlaces] = useState<Restaurant[]>([]);
  // Cuisines du quartier (OSM), recalculées sur les recherches « toutes cuisines », gardées pendant qu'on filtre.
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mode surprise : tirage au sort au lieu du top par note ; la graine change à chaque « Autre tirage ».
  const [surprise, setSurprise] = useState(false);
  const [seed, setSeed] = useState(() => Date.now());
  // Quand la grande dame sort de l'écran, une barre compacte prend le relais en haut.
  const heroRef = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>(hasApiKey ? "locating" : "error");
  const [error, setError] = useState<string | null>(
    hasApiKey ? null : t("missingKey"),
  );
  // Si la géoloc est refusée, on propose de taper une adresse à la place.
  const [askAddress, setAskAddress] = useState(false);
  const [address, setAddress] = useState("");

  // Seule la dernière recherche lancée a le droit d'afficher ses résultats.
  const requestId = useRef(0);
  // Zone déjà fouillée (ou en cours) : lue depuis le handler de la carte, d'où la ref.
  const coveredArea = useRef<Area | null>(null);
  const categoryRef = useRef(category);
  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  const run = useCallback(async (
    search: () => Promise<{ list: Restaurant[]; area: Area }>,
    filtered: boolean,
    refit: boolean,
  ) => {
    const id = ++requestId.current;
    setPhase("searching");
    setError(null);
    try {
      const { list, area } = await search();
      if (id !== requestId.current) return;
      coveredArea.current = area;
      setPlaces(list);
      if (!filtered) {
        // Les catégories sont un plus : si OSM ne répond pas, on garde les précédentes.
        neighborhoodCategories(area.center, area.radius)
          .then((cats) => id === requestId.current && setCategories(cats))
          .catch((err) => console.warn("Catégories OSM indisponibles", err));
      }
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

  // Dès l'ouverture : on récupère la position.
  useEffect(() => {
    if (!hasApiKey) return;
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

  // Position (ou catégorie) connue : on élargit depuis 200 m jusqu'à trouver 5 restos, puis on cadre la carte dessus.
  useEffect(() => {
    if (!home) return;
    coveredArea.current = null;
    run(() => searchUntilTop(home, category), category != null, true);
  }, [home, category, run]);

  // On recherche sur la vue quand l'utilisateur dézoome / se déplace au-delà de la zone fouillée,
  // ou quand il zoome assez pour que la vue soit nettement plus petite que cette zone.
  const onViewportChange = useCallback(
    (view: Area) => {
      const covered = coveredArea.current;
      if (!covered) return;
      const inside = distanceMeters(view.center, covered.center) + view.radius <= covered.radius * 1.05;
      const zoomedIn = view.radius < covered.radius * ZOOM_IN_RATIO;
      if (inside && !zoomedIn) return;
      coveredArea.current = view;
      const c = categoryRef.current;
      run(async () => ({ list: await searchRestaurants(view, c), area: view }), c != null, false);
    },
    [run],
  );

  const onSelectFromMap = useCallback((id: string) => {
    setSelectedId(id);
    document.getElementById(`resto-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const top = useMemo(() => (surprise ? pickRandom(places, seed) : rankTop(places)), [places, surprise, seed]);

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

  const toggleSurprise = (on: boolean) => {
    setSurprise(on);
    setSeed(Date.now());
  };

  return (
    <>
      <MiniBar watch={heroRef} surprise={surprise} onSurprise={toggleSurprise} />
      <main>
        <header ref={heroRef}>
          <ShuffleToggle on={surprise} onChange={toggleSurprise} />
          <Lady mood={mood} surprise={surprise} />
          <h1>J'ai faim</h1>
          <p className="tagline">{surprise ? t("taglineSurprise") : t("tagline")}</p>
        </header>

        {categories.length > 0 && (
          <div className="categories" role="radiogroup" aria-label={t("cuisineType")}>
            {[null, ...categories].map((c) => {
              const active = (c?.key ?? null) === (category?.key ?? null);
              return (
                <button
                  key={c?.key ?? "all"}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={[active && "active", c?.distinctive && "distinctive"].filter(Boolean).join(" ")}
                  title={c?.distinctive ? t("localSpecialty") : undefined}
                  onClick={() => setCategory(active ? null : c)}
                >
                  {c ? (c.distinctive ? `✦ ${c.label}` : c.label) : t("allCuisines")}
                </button>
              );
            })}
          </div>
        )}

        {home && (
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
            {surprise && phase === "done" && top.length > 0 && (
              <button type="button" className="pill pill-button" onClick={() => setSeed(Date.now())}>
                {t("reroll")}
              </button>
            )}
          </RestaurantMap>
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
        · {t("footerPoke")} · <a href="/privacy">{t("privacy")}</a>
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
