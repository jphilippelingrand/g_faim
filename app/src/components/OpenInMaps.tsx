import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";
import { openPlace, type MapsApp } from "../lib/mapsApp";
import type { Restaurant } from "../lib/places";
import { IconButton } from "./IconButton";
import { colors } from "../theme";
import { t } from "../i18n";

/**
 * Le bouton ↗ au bout d'une ligne : ouvre la fiche du resto dans l'appli de cartes choisie (Plans ou
 * Google Maps). Le même partout (liste, vote, résultats).
 */
export function OpenInMaps({ place, onMapsApp }: { place: Restaurant; onMapsApp?: (app: MapsApp) => void }) {
  return (
    <IconButton
      label={t("seeInMaps", { name: place.name })}
      onPress={() => {
        Haptics.selectionAsync();
        openPlace(place).then((app) => app && onMapsApp?.(app));
      }}
    >
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Path d="M5 11 11 5M6 4.5h5.5V10" fill="none" stroke={colors.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </IconButton>
  );
}
