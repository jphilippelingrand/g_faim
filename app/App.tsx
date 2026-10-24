import { Fraunces_700Bold, Fraunces_900Black_Italic, useFonts } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Lady, type Mood } from "./src/components/Lady";
import { RestaurantCard } from "./src/components/RestaurantCard";
import { RestaurantMap } from "./src/components/RestaurantMap";
import {
  distanceMeters,
  formatDistance,
  hasApiKey,
  rankTop,
  searchRestaurants,
  searchUntilTop,
  type Area,
  type LatLng,
  type Restaurant,
} from "./src/lib/places";
import { colors, fonts } from "./src/theme";

SplashScreen.preventAutoHideAsync();

type Phase = "locating" | "searching" | "done" | "error";

// En dessous de cette fraction de la zone fouillée, un zoom avant relance la recherche.
const ZOOM_IN_RATIO = 0.6;

async function getPosition(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error("Je n'ai pas eu accès à ta position.");
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: coords.latitude, longitude: coords.longitude };
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_700Bold, Fraunces_900Black_Italic, Inter_400Regular, Inter_500Medium });
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hide();
  }, [fontsLoaded, fontError]);

  const [home, setHome] = useState<LatLng | null>(null);
  const [places, setPlaces] = useState<Restaurant[]>([]);
  const [area, setArea] = useState<Area | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(hasApiKey ? "locating" : "error");
  const [error, setError] = useState<string | null>(
    hasApiKey ? null : "Clé Google manquante (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).",
  );
  // Si la géoloc est refusée, on propose de taper une adresse à la place.
  const [askAddress, setAskAddress] = useState(false);
  const [address, setAddress] = useState("");

  // Seule la dernière recherche lancée a le droit d'afficher ses résultats.
  const requestId = useRef(0);
  // Zone déjà fouillée (ou en cours) : lue depuis le handler de la carte, d'où la ref.
  const coveredArea = useRef<Area | null>(null);

  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const listY = useRef(0);
  const cardY = useRef(new Map<string, number>());

  const run = useCallback(async (search: () => Promise<{ list: Restaurant[]; area: Area }>, refit: boolean) => {
    const id = ++requestId.current;
    setPhase("searching");
    setError(null);
    try {
      const { list, area } = await search();
      if (id !== requestId.current) return;
      coveredArea.current = area;
      setPlaces(list);
      setArea(area);
      setSelectedId(null);
      if (refit) setFitKey((k) => k + 1);
      setPhase("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    getPosition()
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

  // Position connue : on élargit depuis 200 m jusqu'à trouver 5 restos, puis on cadre la carte dessus.
  useEffect(() => {
    if (!home) return;
    coveredArea.current = null;
    run(() => searchUntilTop(home), true);
  }, [home, run]);

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
      run(async () => ({ list: await searchRestaurants(view), area: view }), false);
    },
    [run],
  );

  const onSelectFromMap = useCallback((id: string) => {
    setSelectedId(id);
    Haptics.selectionAsync();
    const y = cardY.current.get(id);
    if (y != null) scroll.current?.scrollTo({ y: listY.current + y - 120, animated: true });
  }, []);

  const top = useMemo(() => rankTop(places), [places]);

  const busy = phase === "locating" || phase === "searching";
  const mood: Mood = busy ? "starving" : phase === "done" && top.length ? "happy" : "hungry";

  let status = "";
  if (phase === "locating") status = "Je te localise…";
  else if (phase === "searching") status = "Je renifle les cuisines du coin…";
  else if (phase === "error") status = error ?? "";
  else if (!top.length) status = "Rien d'ouvert et bien noté par ici… dézoome la carte ?";
  else status = `Top ${top.length} dans un rayon de ${formatDistance(area?.radius ?? 0)} · dézoome pour voir plus loin`;

  async function submitAddress() {
    if (!address.trim()) return;
    try {
      setPhase("locating");
      // Géocodage du système (Apple sur iOS) : pas besoin de clé Google.
      const [hit] = await Location.geocodeAsync(address.trim());
      if (!hit) throw new Error("Adresse introuvable.");
      setHome({ latitude: hit.latitude, longitude: hit.longitude });
      setAskAddress(false);
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Lady mood={mood} />
            <Text style={styles.title}>J'ai faim</Text>
            <Text style={styles.tagline}>Les 5 meilleures tables, juste à côté.</Text>
          </View>

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

          <Text style={[styles.status, phase === "error" && styles.statusError]}>{status}</Text>

          {askAddress && (
            <View style={styles.address}>
              <TextInput
                style={styles.input}
                placeholder="12 rue des Martyrs, Paris"
                placeholderTextColor={colors.muted}
                value={address}
                onChangeText={setAddress}
                onSubmitEditing={submitAddress}
                returnKeyType="search"
                autoFocus
              />
              <Pressable style={styles.goButton} onPress={submitAddress}>
                <Text style={styles.goButtonText}>Go</Text>
              </Pressable>
            </View>
          )}

          {home && top.length > 0 && (
            <View style={[styles.results, busy && styles.stale]} onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
              {top.map((r, i) => (
                <View key={r.id} onLayout={(e) => cardY.current.set(r.id, e.nativeEvent.layout.y)}>
                  <RestaurantCard
                    r={r}
                    index={i}
                    home={home}
                    distance={distanceMeters(home, r.location)}
                    selected={r.id === selectedId}
                    onSelect={setSelectedId}
                  />
                </View>
              ))}
            </View>
          )}

          <Text style={styles.footer}>Données Google Maps · touche la dame 👆</Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { alignItems: "center" },
  title: { fontFamily: fonts.title, fontSize: 40, color: colors.ink, letterSpacing: -0.8, marginTop: 4 },
  tagline: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginTop: 4, marginBottom: 20 },
  status: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 16, marginBottom: 14 },
  statusError: { color: colors.accent },
  address: { flexDirection: "row", gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  goButton: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, justifyContent: "center" },
  goButtonText: { color: "#fff", fontFamily: fonts.title, fontSize: 16 },
  results: { gap: 14, paddingTop: 8, paddingLeft: 8 },
  stale: { opacity: 0.5 },
  footer: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 24 },
});
