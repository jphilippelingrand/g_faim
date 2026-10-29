import { Fraunces_700Bold, Fraunces_900Black_Italic, useFonts } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Linking, Platform, Pressable, Settings, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchingLady } from "./src/components/SearchingLady";
import { SwipeDeck } from "./src/components/SwipeDeck";
import { RestaurantMap } from "./src/components/RestaurantMap";
import { updateWidget } from "./src/lib/widget";
import { askMapsApp, getMapsApp, openDirections, setMapsApp } from "./src/lib/mapsApp";
import {
  distanceMeters,
  formatClosingTime,
  nearestOpen,
  nearestOpenInView,
  travelTime,
  type Area,
  type LatLng,
  type Restaurant,
} from "./src/lib/places";
import { colors, fonts } from "./src/theme";
import { lang, t } from "./src/i18n";

SplashScreen.preventAutoHideAsync();

type Phase = "locating" | "searching" | "done" | "error";

// Hauteur du bandeau du haut, sous l'encoche.
const TOP_BAR = 52;
// iPhone Duo déplié (ou tout écran large) : le paquet de cartes passe dans un panneau à gauche, la carte à droite.
const WIDE_FROM = 600;
const SIDE_PANEL = 380;
const MARGIN = 16;
const SITE = "https://www.groubl.com";

async function getPosition(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error(t("geolocationDenied"));
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: coords.latitude, longitude: coords.longitude };
}

/**
 * L'écran : carte plein écran et, en bas, le paquet de cartes (comme le site) : le resto le plus proche
 * d'abord ; on glisse à gauche pour le suivant, à droite pour y aller. La carte suit la carte du dessus.
 */
function Main() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_700Bold, Fraunces_900Black_Italic, Inter_400Regular, Inter_500Medium });
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hide();
  }, [fontsLoaded, fontError]);

  const [home, setHome] = useState<LatLng | null>(null);
  const [top, setTop] = useState<Restaurant[]>([]);
  const [area, setArea] = useState<Area | null>(null);
  const [current, setCurrent] = useState(0);
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
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_FROM;

  // Tant que la première recherche autour de soi n'est pas faite, les mouvements de la carte ne comptent pas.
  const searched = useRef(false);
  // « Dis Siri, j'ai faim » (lien gfaim://?faim=1) : dès qu'on a le n°1, on part directement vers lui.
  const goToFirst = useRef(false);
  // Lien gfaim://?card=2 : carte à montrer dès les résultats (captures App Store, le simulateur ne sait pas glisser).
  const startCard = useRef(0);

  // Seule la dernière recherche lancée a le droit d'afficher ses résultats.
  const requestId = useRef(0);
  const run = useCallback(async (search: () => Promise<{ list: Restaurant[]; area: Area }>, refit: boolean) => {
    const id = ++requestId.current;
    setPhase("searching");
    setError(null);
    try {
      const { list, area } = await search();
      if (id !== requestId.current) return;
      searched.current = true;
      setTop(list);
      setArea(area);
      setCurrent(refit ? Math.min(startCard.current, Math.max(list.length - 1, 0)) : 0);
      // Le widget montre le dernier verdict trouvé autour de soi (pas quand on explore la carte ailleurs).
      if (refit) {
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
      const params = Object.fromEntries(
        (url.split("?")[1] ?? "").split("&").filter(Boolean).map((kv) => kv.split("=").map(decodeURIComponent)),
      );
      if (params.card !== undefined) startCard.current = Number(params.card) || 0;
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
    return () => sub.remove();
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

  // Position connue : les 5 restos ouverts les plus proches (on élargit depuis 500 m), la carte cadrée sur toi et le premier.
  useEffect(() => {
    if (!home) return;
    searched.current = false;
    run(() => nearestOpen(home), true);
  }, [home, run]);

  // La carte bouge (déplacement ou zoom) : les 5 plus proches du centre, dans la zone visible, sans la recadrer.
  const onViewportChange = useCallback(
    (view: Area) => {
      if (searched.current) run(() => nearestOpenInView(view), false);
    },
    [run],
  );

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
      show(top.findIndex((r) => r.id === id));
    },
    [show, top],
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
  else if (empty) status = t("nothingOpen");

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
            : [styles.panel, { paddingBottom: insets.bottom + 8 }]
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
          <View style={busy && styles.stale}>
            <SwipeDeck places={top} home={home} current={current} onChange={show} onMapsApp={setMapsAppState} />
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
                {t("mapsWith", { app: mapsApp === "google" ? "Google Maps" : mapsApp === "apple" ? "Plans" : "…" })}
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
