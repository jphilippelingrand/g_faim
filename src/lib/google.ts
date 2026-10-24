const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export const hasApiKey = Boolean(API_KEY && !API_KEY.startsWith("COLLE"));

// Les AdvancedMarker exigent un Map ID ; DEMO_MAP_ID suffit pour un prototype.
export const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || "DEMO_MAP_ID";

let loading: Promise<void> | null = null;

/** Charge le script Maps JS une seule fois. */
function loadGoogleMaps(): Promise<void> {
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const callback = "__jaiFaimMapsReady";
    (window as unknown as Record<string, () => void>)[callback] = () => resolve();

    const params = new URLSearchParams({
      key: API_KEY!,
      v: "weekly",
      language: "fr",
      loading: "async",
      callback,
    });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error("Google Maps n'a pas pu se charger."));
    };
    document.head.append(script);
  });

  return loading;
}

export async function importLibrary<T>(name: string): Promise<T> {
  await loadGoogleMaps();
  return (await google.maps.importLibrary(name)) as T;
}
