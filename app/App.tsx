import { Fraunces_700Bold, Fraunces_900Black_Italic, useFonts } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import BottomSheet, { BottomSheetScrollView, type BottomSheetScrollViewMethods } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { MapControls } from "./src/components/MapControls";
import { MODES, ModePicker, type Mode } from "./src/components/ModePicker";
import { SearchingLady } from "./src/components/SearchingLady";
import { CategoryBar } from "./src/components/CategoryBar";
import { RestaurantCard } from "./src/components/RestaurantCard";
import { RestaurantMap } from "./src/components/RestaurantMap";
import {
  distanceMeters,
  formatDistance,
  hasApiKey,
  pickRandom,
  rankFast,
  rankTop,
  searchRestaurants,
  searchUntilTop,
  type Area,
  type LatLng,
  type Restaurant,
} from "./src/lib/places";
import { colors, fonts } from "./src/theme";
import { lang, t } from "./src/i18n";
import { MAX_SHOWN, neighborhoodCategories, type Category } from "./src/lib/osm";

SplashScreen.preventAutoHideAsync();

type Phase = "locating" | "searching" | "done" | "error";

// Mise en page : hauteur du bandeau du haut (sous l'encoche) et du panneau replié (catégories).
const TOP_BAR = 52;
const SITE = "https://www.groubl.com";
const SHEET_MIN = 190;

// En dessous de cette fraction de la zone fouillée, un zoom avant relance la recherche.
const ZOOM_IN_RATIO = 0.6;

async function getPosition(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error(t("geolocationDenied"));
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: coords.latitude, longitude: coords.longitude };
}

/** L'écran : carte plein écran, barre du haut, et un panneau qu'on tire du bas (dame, catégories, restos). */
function Main() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_700Bold, Fraunces_900Black_Italic, Inter_400Regular, Inter_500Medium });
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hide();
  }, [fontsLoaded, fontError]);

  const [home, setHome] = useState<LatLng | null>(null);
  const [places, setPlaces] = useState<Restaurant[]>([]);
  const [area, setArea] = useState<Area | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Top par note, rapide (fast-foods et vente à emporter, la distance compte) ou surprise (tirage au
  // sort ; la graine change à chaque changement de mode).
  const [mode, setMode] = useState<Mode>("top");
  const surprise = mode === "surprise";
  const fast = mode === "fast";
  const [seed, setSeed] = useState(() => Date.now());
  // Cuisines de la zone visible (fichiers pré-calculés sur groubl.com) et cuisine choisie.
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
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
  const fastRef = useRef(fast);
  useEffect(() => {
    categoryRef.current = category;
    fastRef.current = fast;
  }, [category, fast]);

  // Catégories de la zone visible, recalculées à chaque déplacement de la carte. Seule la dernière demande compte.
  const categoriesRequest = useRef(0);
  const refreshCategories = useCallback((view: Area) => {
    const id = ++categoriesRequest.current;
    neighborhoodCategories(view.center, view.radius)
      .then((cats) => id === categoriesRequest.current && setCategories(cats))
      // Les catégories sont un plus : si le fichier ne se charge pas, on garde les précédentes.
      .catch((err) => console.warn("Catégories indisponibles", err));
  }, []);

  const scroll = useRef<BottomSheetScrollViewMethods>(null);
  const sheet = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  // Hauteurs du panneau : replié (catégories), ouvert (à l'ouverture), presque plein écran.
  // À 40 %, la carte garde assez de hauteur pour ne pas trop dézoomer au cadrage.
  const snapPoints = useMemo(() => [SHEET_MIN, Math.round(screenH * 0.4), Math.round(screenH * 0.9)], [screenH]);
  const [sheetIndex, setSheetIndex] = useState(1);
  // Haut du panneau, suivi en continu par le dé flottant.
  const sheetTop = useSharedValue(screenH);
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
      if (!categoryRef.current) refreshCategories(area);
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
      setError((err as Error).message || t("oops"));
    }
  }, [refreshCategories]);

  // Liens profonds gfaim://?cuisine=poutine&mode=fast&sheet=2 : ouvrent l'app dans un état donné
  // (cuisine choisie dès qu'elle est proposée, mode top/fast/surprise, hauteur du panneau 0/1/2).
  // surprise=1/0 reste compris (anciens liens). Servent aussi
  // à automatiser les captures App Store sur le simulateur, qui ne sait pas toucher l'écran.
  const pendingCuisine = useRef<string | null>(null);
  useEffect(() => {
    const apply = (url: string | null | undefined) => {
      if (!url) return;
      const params = Object.fromEntries(
        (url.split("?")[1] ?? "").split("&").filter(Boolean).map((kv) => kv.split("=").map(decodeURIComponent)),
      );
      const next = params.mode ?? (params.surprise !== undefined ? (params.surprise === "1" ? "surprise" : "top") : undefined);
      if (MODES.includes(next as Mode)) {
        setMode(next as Mode);
        setSeed(Date.now());
      }
      if (params.cuisine !== undefined) pendingCuisine.current = params.cuisine || null;
      if (params.cuisine === "") setCategory(null);
      if (params.sheet !== undefined) sheet.current?.snapToIndex(Number(params.sheet));
    };
    Linking.getInitialURL().then(apply);
    const sub = Linking.addEventListener("url", ({ url }) => apply(url));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const key = pendingCuisine.current;
    const match = key && categories.find((c) => c.key === key);
    if (match) {
      pendingCuisine.current = null;
      setCategory(match);
    }
  }, [categories]);

  // Dès l'ouverture : on récupère la position.
  useEffect(() => {
    if (!hasApiKey) return;
    let cancelled = false;
    getPosition()
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

  // Position (ou cuisine, ou mode rapide) connue : on élargit depuis 200 m jusqu'à trouver 5 restos,
  // puis on cadre la carte dessus.
  useEffect(() => {
    if (!home) return;
    coveredArea.current = null;
    run(() => searchUntilTop(home, category, fast), true);
  }, [home, category, fast, run]);

  // On recherche sur la vue quand l'utilisateur dézoome / se déplace au-delà de la zone fouillée,
  // ou quand il zoome assez pour que la vue soit nettement plus petite que cette zone.
  const onViewportChange = useCallback(
    (view: Area) => {
      const covered = coveredArea.current;
      if (!covered) return;
      refreshCategories(view);
      const inside = distanceMeters(view.center, covered.center) + view.radius <= covered.radius * 1.05;
      const zoomedIn = view.radius < covered.radius * ZOOM_IN_RATIO;
      if (inside && !zoomedIn) return;
      coveredArea.current = view;
      const c = categoryRef.current;
      const f = fastRef.current;
      run(async () => ({ list: await searchRestaurants(view, c, f), area: view }), false);
    },
    [run, refreshCategories],
  );

  // Bouton ➤ : reprend la position GPS (on a pu bouger) et relance la recherche depuis le plus petit
  // rayon, carte recentrée sur soi, comme à l'ouverture. Sans position (refusée), on repart de la dernière connue.
  const recenter = useCallback(() => {
    if (!home) return;
    getPosition()
      .then((pos) => setHome(pos))
      .catch(() => setHome((h) => (h ? { ...h } : h)));
  }, [home]);

  const onSelectFromMap = useCallback((id: string) => {
    setSelectedId(id);
    Haptics.selectionAsync();
    // Ouvre le panneau à mi-hauteur et fait défiler jusqu'au resto.
    sheet.current?.snapToIndex(1);
    const y = cardY.current.get(id);
    if (y != null) scroll.current?.scrollTo({ y: listY.current + y - 16, animated: true });
  }, []);

  const top = useMemo(
    () => (surprise ? pickRandom(places, seed) : fast && home ? rankFast(places, home) : rankTop(places)),
    [places, surprise, seed, fast, home],
  );

  // 4 cuisines au plus ; la cuisine choisie reste affichée même si elle sort du top en bougeant la carte.
  const top4 = categories.slice(0, MAX_SHOWN);
  const shownCategories =
    category && !top4.some((c) => c.key === category.key) ? [...top4.slice(0, MAX_SHOWN - 1), category] : top4;

  const busy = phase === "locating" || phase === "searching";

  // Ligne de statut seulement quand il y a quelque chose à dire ; sinon, l'accroche.
  let status = "";
  if (phase === "locating") status = t("locating");
  else if (phase === "searching") status = t("searching");
  else if (phase === "error") status = error ?? "";
  else if (!top.length) status = t("nothingOpen");

  async function submitAddress() {
    if (!address.trim()) return;
    try {
      setPhase("locating");
      // Géocodage du système (Apple sur iOS) : pas besoin de clé Google.
      const [hit] = await Location.geocodeAsync(address.trim());
      if (!hit) throw new Error(t("addressNotFound"));
      setHome({ latitude: hit.latitude, longitude: hit.longitude });
      setAskAddress(false);
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }

  if (!fontsLoaded && !fontError) return null;

  const topBarHeight = insets.top + TOP_BAR;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {home ? (
        <RestaurantMap
          home={home}
          results={top}
          area={area}
          fitKey={fitKey}
          selectedId={selectedId}
          onSelect={onSelectFromMap}
          onViewportChange={onViewportChange}
          // Panneau plein écran : la carte est cachée, on garde le cadrage de la position moitié.
          insets={{ top: topBarHeight, bottom: snapPoints[Math.min(sheetIndex, 1)] }}
        />
      ) : (
        <View style={styles.mapPlaceholder} />
      )}

      {/* La dame en grand, seulement pendant la recherche, au milieu de la partie visible de la carte. */}
      <SearchingLady
        visible={busy}
        mode={mode}
        top={topBarHeight}
        bottom={snapPoints[Math.min(sheetIndex, 1)]}
      />

      <View style={[styles.banner, { paddingTop: insets.top, height: topBarHeight }]}>
        <Text style={styles.bannerTitle} accessibilityRole="header">
          {t("appName")}
        </Text>
      </View>
      {/* Les trois modes, à gauche du bandeau. Hors du bandeau pour que le nom du mode déborde dessous. */}
      <ModePicker
        style={{ top: insets.top + (TOP_BAR - 42) / 2, left: 12 }}
        mode={mode}
        onChange={(next) => {
          setMode(next);
          setSeed(Date.now());
        }}
      />

      <MapControls
        onRecenter={recenter}
        sheetTop={sheetTop}
        screenHeight={screenH}
      />

      <BottomSheet
        ref={sheet}
        index={1}
        snapPoints={snapPoints}
        onChange={setSheetIndex}
        animatedPosition={sheetTop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        enableDynamicSizing={false}
      >
        <BottomSheetScrollView ref={scroll} contentContainerStyle={styles.sheetContent}>
          {status !== "" && <Text style={[styles.status, phase === "error" && styles.statusError]}>{status}</Text>}

          {shownCategories.length > 0 && (
            <CategoryBar categories={shownCategories} selected={category} onSelect={setCategory} />
          )}

          {askAddress && (
            <View style={styles.address}>
              <TextInput
                style={styles.input}
                placeholder={t("addressPlaceholder")}
                placeholderTextColor={colors.muted}
                value={address}
                onChangeText={setAddress}
                onSubmitEditing={submitAddress}
                onFocus={() => sheet.current?.snapToIndex(2)}
                returnKeyType="search"
              />
              <Pressable style={styles.goButton} onPress={submitAddress}>
                <Text style={styles.goButtonText}>{t("go")}</Text>
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

          <Text style={styles.footer}>
            {t("footer")}
            {"\n"}
            <Text style={styles.footerLink} onPress={() => Linking.openURL(`${SITE}/${lang}/privacy`)} accessibilityRole="link">
              {t("privacy")}
            </Text>
            {"  ·  "}
            <Text style={styles.footerLink} onPress={() => Linking.openURL(`${SITE}/${lang}/support`)} accessibilityRole="link">
              {t("support")}
            </Text>
          </Text>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.screen}>
        <Main />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  mapPlaceholder: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.accentSoft },
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 246, 239, 0.94)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  bannerTitle: { fontFamily: fonts.title, fontSize: 24, color: colors.ink, letterSpacing: -0.5 },
  sheetBackground: { backgroundColor: colors.bg, borderRadius: 24 },
  sheetHandle: { backgroundColor: colors.line, width: 44 },
  sheetContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 },
  status: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 12 },
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
  footer: { fontFamily: fonts.body, fontSize: 12, lineHeight: 20, color: colors.muted, textAlign: "center", marginTop: 24 },
  footerLink: { textDecorationLine: "underline" },
});
