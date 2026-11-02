import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { openPlace, type MapsApp } from "../lib/mapsApp";
import type { Restaurant } from "../lib/places";
import { colors } from "../theme";
import { t } from "../i18n";

/**
 * Le petit bouton rond ↗ au bout d'une ligne : ouvre la fiche du resto dans l'appli de cartes choisie
 * (Plans ou Google Maps). Discret, pour que la ligne reste lisible ; le même partout (liste, vote, résultats).
 */
export function OpenInMaps({ place, onMapsApp }: { place: Restaurant; onMapsApp?: (app: MapsApp) => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={() => {
        Haptics.selectionAsync();
        openPlace(place).then((app) => app && onMapsApp?.(app));
      }}
      hitSlop={8}
      accessibilityRole="link"
      accessibilityLabel={t("seeInMaps", { name: place.name })}
    >
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Path d="M5 11 11 5M6 4.5h5.5V10" fill="none" stroke={colors.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  pressed: { backgroundColor: colors.accentSoft, transform: [{ scale: 0.94 }] },
});
