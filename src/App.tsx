import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Lady, type Mood } from "./components/Lady";
import { RestaurantCard } from "./components/RestaurantCard";
import { RestaurantMap } from "./components/RestaurantMap";
import { hasApiKey } from "./lib/google";
import {
  distanceMeters,
  formatDistance,
  geocode,
  getBrowserPosition,
  rankTop,
  searchRestaurants,
  searchUntilTop,
  topCategories,
  type Area,
  type Category,
  type LatLng,
  type Restaurant,
} from "./lib/places";

type Phase = "locating" | "searching" | "done" | "error";

// En dessous de cette fraction de la zone fouillée, un zoom avant relance la recherche.
const ZOOM_IN_RATIO = 0.6;

export default function App() {
  const [home, setHome] = useState<LatLng | null>(null);
  const [places, setPlaces] = useState<Restaurant[]>([]);
  // Catégories proposées : calculées sur les recherches « toutes cuisines », gardées pendant qu'on filtre.
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(hasApiKey ? "locating" : "error");
  const [error, setError] = useState<string | null>(
    hasApiKey ? null : "Ajoute ta clé dans .env (VITE_GOOGLE_MAPS_API_KEY), puis relance npm run dev.",
  );
  // Si la géoloc est refusée, on propose de taper une adresse à la place.
  const [askAddress, setAskAddress] = useState(false);
  const [address, setAddress] = useState("");

  // Seule la dernière recherche lancée a le droit d'afficher ses résultats.
  const requestId = useRef(0);
  // Zone déjà fouillée (ou en cours) : lue depuis le handler de la carte, d'où la ref.
  const coveredArea = useRef<Area | null>(null);
  // Tous les restos vus pendant la session (recherches « toutes cuisines ») : les catégories s'affinent en explorant.
  const seen = useRef(new Map<string, Restaurant>());
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
        list.forEach((r) => seen.current.set(r.id, r));
        setCategories(topCategories([...seen.current.values()]));
      }
      setArea(area);
      setSelectedId(null);
      if (refit) setFitKey((k) => k + 1);
      setPhase("done");
    } catch (err) {
      if (id !== requestId.current) return;
      console.error(err);
      setPhase("error");
      setError((err as Error).message || "Oups, quelque chose a coincé.");
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
        setError(`${err.message} Dis-moi où tu es :`);
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

  const top = useMemo(() => rankTop(places), [places]);

  const busy = phase === "locating" || phase === "searching";
  const mood: Mood = busy ? "starving" : phase === "done" && top.length ? "happy" : "hungry";

  let status = "";
  if (phase === "locating") status = "Je te localise…";
  else if (phase === "searching") status = "Je renifle les cuisines du coin…";
  else if (phase === "error") status = error ?? "";
  else if (!top.length) status = "Rien d'ouvert et bien noté par ici… dézoome la carte ?";
  else status = `Top ${top.length}${category ? ` ${category.label.toLowerCase()}` : ""} dans un rayon de ${formatDistance(area?.radius ?? 0)} · dézoome pour voir plus loin`;

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
      <main>
        <header>
          <Lady mood={mood} />
          <h1>J'ai faim</h1>
          <p className="tagline">Les 5 meilleures tables, juste à côté.</p>
        </header>

        {categories.length > 0 && (
          <div className="categories" role="radiogroup" aria-label="Type de cuisine">
            {[null, ...categories].map((c) => {
              const active = (c?.type ?? null) === (category?.type ?? null);
              return (
                <button
                  key={c?.type ?? "all"}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={active ? "active" : ""}
                  onClick={() => setCategory(active ? null : c)}
                >
                  {c ? c.label : "Tout"}
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
          />
        )}

        <p className={`status${phase === "error" ? " error" : ""}`} role="status">
          {status}
        </p>

        {askAddress && (
          <form className="address" onSubmit={submitAddress}>
            <input
              type="text"
              placeholder="12 rue des Martyrs, Paris"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoFocus
            />
            <button type="submit">Go</button>
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
        Données Google Maps · clique sur la dame 👆 · <a href="/privacy">Confidentialité</a>
      </footer>
    </>
  );
}
