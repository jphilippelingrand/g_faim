import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import type { Category } from "../lib/osm";
import { colors, fonts } from "../theme";

type Props = {
  categories: Category[];
  selected: Category | null;
  /** null = désélection (on retouche la cuisine choisie). */
  onSelect: (category: Category | null) => void;
};

/** 4 cuisines au plus : gros emoji dans un rond + nom, rebond orange à la sélection. */
export function CategoryBar({ categories, selected, onSelect }: Props) {
  return (
    <View style={styles.row} accessibilityRole="toolbar" accessibilityLabel={t("cuisineType")}>
      {categories.map((c) => (
        <CategoryButton
          key={c.key}
          category={c}
          active={c.key === selected?.key}
          onPress={() => {
            Haptics.selectionAsync();
            onSelect(c.key === selected?.key ? null : c);
          }}
        />
      ))}
    </View>
  );
}

function CategoryButton({ category, active, onPress }: { category: Category; active: boolean; onPress: () => void }) {
  const [anim] = useState(() => new Animated.Value(active ? 1 : 0));
  useEffect(() => {
    Animated.spring(anim, { toValue: active ? 1 : 0, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [active, anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-8deg"] });

  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={category.label}
      accessibilityHint={category.distinctive ? t("localSpecialty") : undefined}
    >
      <Animated.View style={[styles.circle, active && styles.circleActive, { transform: [{ scale }, { rotate }] }]}>
        <Text style={styles.emoji}>{category.emoji}</Text>
      </Animated.View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {category.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  button: { flex: 1, alignItems: "center", gap: 6 },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  circleActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  emoji: { fontSize: 30 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink, maxWidth: "95%" },
  labelActive: { color: colors.accent, fontFamily: fonts.title },
});
