import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import type * as NotificationsModule from "expo-notifications";

/**
 * Les notifications « un copain a voté » : le jeton de l'iPhone, envoyé avec chaque sondage qu'on lance (le
 * serveur, api/polls.ts, passe par le service de push d'Expo). Toucher la notification ouvre le sondage :
 * voir onPollNotification.
 *
 * Chargé seulement si le build contient le module natif : une app de dev plus ancienne tourne sans (pas de
 * notification, rien ne plante).
 */
const Notifications: typeof NotificationsModule | null = requireOptionalNativeModule("ExpoPushTokenManager")
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("expo-notifications")
  : null;

// L'app ouverte : la notification s'affiche quand même, en bannière.
Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Le jeton de notification, en demandant la permission la première fois ; undefined si refusé ou indisponible. */
export async function pushToken(): Promise<string | undefined> {
  if (!Notifications) return undefined;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status === "undetermined") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return undefined;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (err) {
    // Simulateur, pas de réseau, clé de push absente côté Apple… le sondage part quand même.
    console.warn("Notifications", err);
    return undefined;
  }
}

/** Appelle `open` avec le lien du sondage quand on touche une notification de vote (app lancée ou non). */
export function onPollNotification(open: (url: string) => void): () => void {
  if (!Notifications) return () => {};
  const urlOf = (response: NotificationsModule.NotificationResponse | null) => response?.notification.request.content.data?.url;
  const first = urlOf(Notifications.getLastNotificationResponse());
  if (typeof first === "string") {
    open(first);
    Notifications.clearLastNotificationResponse();
  }
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = urlOf(response);
    if (typeof url === "string") open(url);
  });
  return () => sub.remove();
}
