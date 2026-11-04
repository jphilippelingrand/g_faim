import { Fraunces_700Bold, Fraunces_900Black_Italic, useFonts } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, Platform, Pressable, Settings, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchingLady } from "./src/components/SearchingLady";
import { SwipeDeck } from "./src/components/SwipeDeck";
import { PlaceList } from "./src/components/PlaceList";
import { MainMenu, type ViewMode } from "./src/components/MainMenu";
import { PollSheet } from "./src/components/PollSheet";
import { RestaurantMap } from "./src/components/RestaurantMap";
import { updateWidget } from "./src/lib/widget";
import { askMapsApp, getMapsApp, openDirections, setMapsApp } from "./src/lib/mapsApp";
import { joinPoll, pollIdFrom, type MyPoll } from "./src/lib/polls";
import { onPollNotification } from "./src/lib/notifications";
import {
  distanceMeters,
  formatClosingTime,
  inView,
  nearest,
  nearestInView,
  nearestOpen,
  nearestOpenInView,
  PAGE,
  travelTime,
  type Area,
  type Box,
  type LatLng,
  type Restaurant,
  type Search,
} from "./src/lib/places";
import { colors, fonts } from "./src/theme";
import { lang, t } from "./src/i18n";

SplashScreen.preventAutoHideAsync();

type Phase = "locating" | "searching" | "done" | "error";

/** Le paquet de cartes à glisser, ou la liste qu'on fait défiler ; choix retenu par l'iPhone. */
const VIEW_MODE_KEY = "viewMode";
const savedViewMode = (): ViewMode => (Platform.OS === "ios" && Settings.get(VIEW_MODE_KEY) === "list" ? "list" : "cards");
// « Ouverts » : seulement les restos ouverts (par défaut), ou tous ceux d'à côté. Retenu d'une fois sur l'autre.
const OPEN_ONLY_KEY = "openOnly";
const savedOpenOnly = () => !(Platform.OS === "ios" && Settings.get(OPEN_ONLY_KEY) === 0);

// Hauteur du bandeau du haut, sous l'encoche.
const TOP_BAR = 52;
// iPhone Duo déplié (ou tout écran large) : le paquet de cartes passe dans un panneau à gauche, la carte à droite.
const WIDE_FROM = 600;
const SIDE_PANEL = 380;
const MARGIN = 16;
const SITE = "https://www.groubl.com";
// En mode liste, le panneau du bas prend cette part de l'écran ; la carte reste visible au-dessus.
const LIST_SHARE = 0.55;

// Une position de moins de 2 min (une autre app, ou la nôtre) suffit : réponse immédiate.
const FRESH_MS = 2 * 60_000;
// Au-delà, on ne bloque plus l'écran : on prend la dernière connue s'il y en a une.
const FIX_TIMEOUT_MS = 10_000;

/**
 * Où on est. iOS répond parfois « position indisponible » juste après le lancement (pas encore de fix GPS,
 * à l'intérieur, téléphone tout juste déverrouillé) : on réessaie une fois en précision réduite, et on se
 * rabat sur la dernière position connue (jusqu'à 30 min) plutôt que d'afficher une erreur.
 */
async function getPosition(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error(t("geolocationDenied"));
  const asLatLng = ({ coords }: Location.LocationObject) => ({ latitude: coords.latitude, longitude: coords.longitude });
  const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 }).catch(() => null);
  if (last && Date.now() - last.timestamp < FRESH_MS) return asLatLng(last);
  const fix = (accuracy: Location.Accuracy) =>
    Promise.race([
      Location.getCurrentPositionAsync({ accuracy }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), FIX_TIMEOUT_MS)),
    ]);
  try {
    return asLatLng(await fix(Location.Accuracy.Balanced));
  } catch (err) {
    if (last) return asLatLng(last);
    try {
      return asLatLng(await fix(Location.Accuracy.Low));
    } catch {
      console.warn("Position", err);
      throw new Error(t("geolocationDenied"));
    }
  }
}

/**
 * L'écran : carte plein écran et, en bas, le paquet de cartes (comme le site) : le resto le plus proche
 * d'abord ; on glisse à gauche pour le suivant, à droite pour y aller. La carte suit la carte du dessus.
 * Ou, au choix, la liste. Dans les deux cas, sans fin : la suite se charge, toujours un peu plus loin.
 */
function Main() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_700Bold, Fraunces_900Black_Italic, Inter_400Regular, Inter_500Medium });
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hide();
  }, [fontsLoaded, fontError]);

  const [home, setHome] = useState<LatLng | null>(null);
  const [top, setTop] = useState<Restaurant[]>([]);
  const [area, setArea] = useState<Area | null>(null);
  // Tous les restos de la zone visible de la carte (pas seulement la pile de cartes) : la carte les montre,
  // regroupés quand ils sont serrés, pour qu'elle ne soit pas vide autour du centre quand on dézoome.
  const [around, setAround] = useState<Restaurant[]>([]);
  const aroundId = useRef(0);
  const [current, setCurrent] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(savedViewMode);
  const [openOnly, setOpenOnly] = useState(savedOpenOnly);
  const [pollOpen, setPollOpen] = useState(false);
  // Change à chaque ouverture : la feuille repart de zéro (le resto affiché coché).
  const [pollKey, setPollKey] = useState(0);
  // Un lien de vote ouvert dans l'app (groubl.com/v/<id>) : la feuille s'ouvre directement sur lui.
  const [pollFromLink, setPollFromLink] = useState<MyPoll | null>(null);
  // Incrémenté quand la carte doit se recadrer sur toi + la carte du dessus.
  const [fitKey, setFitKey] = useState(0);
  const [phase, setPhase] = useState<Phase>("locating");
  const [error, setError] = useState<string | null>(null);
  // Si la géoloc est refusée, on propose de taper une adresse à la place.
  const [askAddress, setAskAddress] = useState(false);
  const [address, setAddress] = useState("");
  // Hauteur du panneau du bas : la carte se cadre au-dessus.
  const [panelHeight, setPanelHeight] = useState(260);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE_FROM;

  // Tant que la première recherche autour de soi n'est pas faite, les mouvements de la carte ne comptent pas.
  const searched = useRef(false);
  // « Dis Siri, j'ai faim » (lien gfaim://?faim=1) : dès qu'on a le n°1, on part directement vers lui.
  const goToFirst = useRef(false);
  // Lien gfaim://?card=2 : carte à montrer dès les résultats (captures App Store, le simulateur ne sait pas glisser).
  const startCard = useRef(0);

  // Seule la dernière recherche lancée a le droit d'afficher ses résultats (et sa suite).
  const requestId = useRef(0);
  // La recherche en cours, pour en demander la suite : même point de départ, plus de restos.
  const lastSearch = useRef<((count: number) => Promise<Search>) | null>(null);
  const run = useCallback(async (search: (count: number) => Promise<Search>, refit: boolean) => {
    const id = ++requestId.current;
    lastSearch.current = search;
    setPhase("searching");
    setError(null);
    setLoadingMore(false);
    try {
      const { list, area, hasMore } = await search(PAGE);
      if (id !== requestId.current) return;
      searched.current = true;
      setTop(list);
      setArea(area);
      setHasMore(hasMore);
      setCurrent(refit ? Math.min(startCard.current, Math.max(list.length - 1, 0)) : 0);
      // Le widget montre le dernier verdict trouvé autour de soi (pas quand on explore la carte ailleurs, ni un resto fermé).
      if (refit && list[0]?.open !== false) {
        const first = list[0];
        const trip = first && travelTime(distanceMeters(area.center, first.location));
        updateWidget(
          first
            ? {
                name: first.name,
                minutes: trip.minutes,
                mode: trip.mode,
                closing: first.closesIn === undefined || first.closesIn === Infinity ? null : formatClosingTime(first.closesIn),
              }
            : null,
        );
      }
      if (refit && goToFirst.current && list[0]) {
        goToFirst.current = false;
        const trip = travelTime(distanceMeters(area.center, list[0].location));
        openDirections(list[0], trip.mode === "walk").then((app) => app && setMapsAppState(app));
      }
      if (refit) setFitKey((k) => k + 1);
      setPhase("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error(err);
      setPhase("error");
      setError((err as Error).message || t("oops"));
    }
  }, []);

  // Liens profonds : gfaim://?faim=1 (raccourci Siri, widget) part tout de suite vers le resto le plus proche ;
  // gfaim://?card=2 montre la 3e carte. Même chose au lancement avec l'argument -deeplink "card=2" (iOS le range
  // dans les préférences) : le simulateur demande confirmation à chaque gfaim://, pas au lancement.
  useEffect(() => {
    const apply = (url: string | null | undefined) => {
      if (!url) return;
      if (pollIdFrom(url)) {
        joinPoll(url)
          .then((poll) => {
            setPollFromLink(poll);
            setPollKey((k) => k + 1);
            setPollOpen(true);
          })
          .catch(console.error);
        return;
      }
      const params = Object.fromEntries(
        (url.split("?")[1] ?? "").split("&").filter(Boolean).map((kv) => kv.split("=").map(decodeURIComponent)),
      );
      if (params.card !== undefined) startCard.current = Number(params.card) || 0;
      // gfaim://?vote=1 : la feuille « On mange où ? » ouverte d'office (captures, essais sur le simulateur).
      if (params.vote === "1") {
        setPollFromLink(null);
        setPollKey((k) => k + 1);
        setPollOpen(true);
      }
      if (params.faim === "1") {
        // L'app tournait peut-être déjà : on reprend la position pour relancer la recherche autour de soi.
        goToFirst.current = true;
        getPosition()
          .then(setHome)
          .catch(() => setHome((h) => (h ? { ...h } : h)));
      }
    };
    Linking.getInitialURL().then(apply);
    if (Platform.OS === "ios") {
      const arg = Settings.get("deeplink");
      if (typeof arg === "string") apply(`gfaim://?${arg}`);
    }
    const sub = Linking.addEventListener("url", ({ url }) => apply(url));
    // « Un copain a voté » : la notification touchée ouvre le sondage, comme son lien.
    const stopNotifications = onPollNotification(apply);
    return () => {
      sub.remove();
      stopNotifications();
    };
  }, []);

  // Dès l'ouverture : on récupère la position.
  useEffect(() => {
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

  // Position connue : les restos ouverts les plus proches (on élargit depuis 500 m), la carte cadrée sur toi et le premier.
  useEffect(() => {
    if (!home) return;
    searched.current = false;
    run((count) => (openOnly ? nearestOpen(home, count) : nearest(home, count)), true);
  }, [home, run, openOnly]);

  // La carte bouge (déplacement ou zoom) : les plus proches du centre, à partir de la zone visible, sans la recadrer.
  const onViewportChange = useCallback(
    (view: Area) => {
      if (searched.current) run((count) => (openOnly ? nearestOpenInView(view, count) : nearestInView(view, count)), false);
    },
    [run, openOnly],
  );

  // La carte s'est arrêtée (y compris sur nos recadrages) : on recharge tous les restos de sa zone visible.
  const onMapStop = useCallback(
    (box: Box) => {
      if (!home) return;
      const id = ++aroundId.current;
      inView(box, home)
        .then((list) => id === aroundId.current && setAround(list))
        .catch(console.error);
    },
    [home],
  );
  // Avec le filtre « ouverts seulement », pas de restos fermés sur la carte (ceux aux horaires inconnus restent).
  const aroundShown = useMemo(() => (openOnly ? around.filter((r) => r.open !== false) : around), [around, openOnly]);

  // La suite : on refait la recherche avec une page de plus. Ceux déjà vus gardent leur place (et leur numéro),
  // les nouveaux s'ajoutent derrière.
  const loadMore = useCallback(async () => {
    const search = lastSearch.current;
    if (!search) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const shown = top;
      const { list, area, hasMore } = await search(shown.length + PAGE);
      if (id !== requestId.current) return;
      const seen = new Set(shown.map((r) => r.id));
      const added = list.filter((r) => !seen.has(r.id));
      setTop([...shown, ...added]);
      setArea(area);
      setHasMore(hasMore && added.length > 0);
    } catch (err) {
      // Réseau coupé : on s'arrête là plutôt que de réessayer en boucle (le logo relance une recherche).
      console.error(err);
      if (id === requestId.current) setHasMore(false);
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  }, [top]);

  // Le menu « ⋯ » : montrer aussi les restos fermés, c'est couper le filtre « ouverts seulement ».
  const changeShowClosed = (show: boolean) => {
    setOpenOnly(!show);
    if (Platform.OS === "ios") Settings.set({ [OPEN_ONLY_KEY]: show ? 0 : 1 });
  };

  const changeViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
    if (Platform.OS === "ios") Settings.set({ [VIEW_MODE_KEY]: mode });
  };

  // Le logo repart de zéro : on reprend la position GPS (on a pu bouger) et on recherche autour de soi.
  const restart = useCallback(() => {
    Haptics.selectionAsync();
    startCard.current = 0;
    getPosition()
      .then((pos) => setHome(pos))
      .catch(() => setHome((h) => (h ? { ...h } : h)));
  }, []);

  // Une autre carte (glissée, ou son épingle touchée) : la carte la suit.
  const show = useCallback((index: number) => {
    if (index < 0) return;
    setCurrent(index);
    setFitKey((k) => k + 1);
  }, []);
  const onSelectFromMap = useCallback(
    (id: string) => {
      Haptics.selectionAsync();
      const index = top.findIndex((r) => r.id === id);
      if (index >= 0) return show(index);
      // Un resto de la carte qui n'est pas (encore) dans la pile : il s'y glisse juste après la carte du dessus.
      const place = around.find((r) => r.id === id);
      if (!place) return;
      const at = top.length ? current + 1 : 0;
      setTop([...top.slice(0, at), place, ...top.slice(at)]);
      show(at);
    },
    [show, top, around, current],
  );

  // L'appli de cartes retenue, qu'on peut changer en bas de l'écran.
  const [mapsApp, setMapsAppState] = useState(getMapsApp);
  const changeMapsApp = async () => {
    const app = await askMapsApp();
    if (!app) return;
    setMapsApp(app);
    setMapsAppState(app);
  };

  const busy = phase === "locating" || phase === "searching";
  const empty = phase === "done" && !top.length;

  let status = "";
  if (phase === "locating") status = t("locating");
  else if (phase === "error") status = error ?? "";
  else if (empty) status = t(openOnly ? "nothingOpen" : "nothingNear");

  async function submitAddress() {
    if (!address.trim()) return;
    try {
      setPhase("locating");
      // Géocodage du système (Apple sur iOS) : pas besoin de clé.
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
          around={aroundShown}
          onMapStop={onMapStop}
          area={area}
          fitKey={fitKey}
          selectedId={top[current]?.id ?? null}
          onSelect={onSelectFromMap}
          onViewportChange={onViewportChange}
          insets={wide ? { top: topBarHeight, bottom: 0, left: SIDE_PANEL + MARGIN } : { top: topBarHeight, bottom: panelHeight }}
        />
      ) : (
        <View style={styles.mapPlaceholder} />
      )}

      {/* La dame en grand, seulement pendant la première recherche ou quand rien n'est ouvert. */}
      <SearchingLady visible={(busy && !top.length) || empty} mode="top" top={topBarHeight} bottom={wide ? 0 : panelHeight} />

      <View style={[styles.topRight, { top: insets.top + 10 }]}>
        {/* « On mange où ? » : un vote entre copains sur les restos cochés, et ses sondages en cours. */}
        {home && (
          <Pressable
            style={({ pressed }) => [styles.pollButton, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              setPollFromLink(null);
              setPollKey((k) => k + 1);
              setPollOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t("poll")}
          >
            <Text style={styles.modeIcon}>🧑‍🤝‍🧑</Text>
          </Pressable>
        )}
        {/* Le reste dans un menu : la vue (swipe ou liste) et les restos fermés. Les choix restent d'une fois sur l'autre. */}
        <MainMenu
          top={insets.top + 56}
          viewMode={viewMode}
          onViewMode={changeViewMode}
          showClosed={!openOnly}
          onShowClosed={changeShowClosed}
        />
      </View>

      {/* Même sans position (lien de vote ouvert à froid) : on peut voter, pas encore en lancer un. */}
      <PollSheet
        key={pollKey}
        visible={pollOpen}
        places={home ? top : []}
        home={home ?? { latitude: 0, longitude: 0 }}
        preselected={top[current]?.id}
        initialPoll={pollFromLink}
        onMapsApp={setMapsAppState}
        onClose={() => setPollOpen(false)}
      />

      {/* Le logo repart de zéro autour de soi. */}
      <Pressable
        style={({ pressed }) => [styles.brand, { top: insets.top + 8 }, pressed && styles.pressed]}
        onPress={restart}
        accessibilityRole="button"
        accessibilityLabel={t("restart")}
      >
        <Image source={require("./assets/icon.png")} style={styles.brandIcon} />
        <Text style={styles.brandText}>{t("appName")}</Text>
      </Pressable>

      <View
        style={
          wide
            ? [styles.panel, styles.sidePanel, { top: topBarHeight + MARGIN, bottom: insets.bottom + MARGIN, left: insets.left + MARGIN }]
            : [styles.panel, { paddingBottom: insets.bottom + 8 }, viewMode === "list" && top.length > 0 && { height: Math.round(height * LIST_SHARE) }]
        }
        onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
      >
        {status !== "" && <Text style={[styles.status, phase === "error" && styles.statusError]}>{status}</Text>}

        {askAddress && (
          <View style={styles.address}>
            <TextInput
              style={styles.input}
              placeholder={t("addressPlaceholder")}
              placeholderTextColor={colors.muted}
              value={address}
              onChangeText={setAddress}
              onSubmitEditing={submitAddress}
              returnKeyType="search"
            />
            <Pressable style={styles.goButton} onPress={submitAddress}>
              <Text style={styles.goButtonText}>{t("go")}</Text>
            </Pressable>
          </View>
        )}

        {home && top.length > 0 && (
          <View style={[busy && styles.stale, viewMode === "list" && styles.listArea]}>
            {viewMode === "cards" ? (
              <SwipeDeck
                places={top}
                home={home}
                current={current}
                onChange={show}
                onMapsApp={setMapsAppState}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onNeedMore={loadMore}
              />
            ) : (
              <PlaceList
                places={top}
                home={home}
                current={current}
                onChange={show}
                onMapsApp={setMapsAppState}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onNeedMore={loadMore}
              />
            )}
          </View>
        )}

        <Text style={styles.footer}>
          <Text style={styles.footerLink} onPress={() => Linking.openURL(`${SITE}/${lang}/privacy`)} accessibilityRole="link">
            {t("privacy")}
          </Text>
          {"  ·  "}
          <Text style={styles.footerLink} onPress={() => Linking.openURL(`${SITE}/${lang}/support`)} accessibilityRole="link">
            {t("support")}
          </Text>
          {Platform.OS === "ios" && (
            <>
              {"  ·  "}
              <Text style={styles.footerLink} onPress={changeMapsApp} accessibilityRole="button">
                {t("mapsWith", { app: mapsApp === "google" ? "Google Maps" : mapsApp === "apple" ? t("appleMaps") : "…" })}
              </Text>
            </>
          )}
          {"\n"}
          {t("footer")}
        </Text>
      </View>
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
  brand: {
    position: "absolute",
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: "rgba(251, 246, 239, 0.94)",
    shadowColor: colors.ink,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  brandIcon: { width: 34, height: 34, borderRadius: 17 },
  brandText: { fontFamily: fonts.title, fontSize: 19, color: colors.ink },
  pressed: { transform: [{ scale: 0.95 }] },
  topRight: { position: "absolute", right: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  pollButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 246, 239, 0.94)",
    shadowColor: colors.ink,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  modeIcon: { fontSize: 18 },
  listArea: { flex: 1 },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
  },
  // Panneau posé à gauche de la carte, sur l'écran large ; le paquet de cartes reste en haut du panneau.
  sidePanel: { right: undefined, width: SIDE_PANEL, borderRadius: 24, paddingBottom: 12, justifyContent: "flex-start" },
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
  stale: { opacity: 0.5 },
  footer: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 12 },
  footerLink: { textDecorationLine: "underline" },
});
