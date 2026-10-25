import { cellKey, findNode, levelForRadius, type CuisineNode } from "./cuisineGrid";
import type { LatLng } from "./places";

/**
 * Catégories de cuisine de la zone, pré-calculées depuis OpenStreetMap (tools/build-cuisines.ts)
 * dans public/cuisines/*.json. Licence ODbL : on peut agréger et redistribuer en citant la source.
 * Les données Google, elles, ne doivent servir à créer aucun contenu dérivé : on ne s'en sert que
 * pour chercher, en direct, les restos d'une catégorie.
 */
export type Category = {
  /** Valeur OSM de cuisine=* (ex. "poutine"). */
  key: string;
  label: string;
  /** Ce qu'on tape dans la recherche Google pour trouver cette cuisine. */
  query: string;
  /** Nettement plus présente ici qu'en moyenne dans le monde. */
  distinctive: boolean;
};

// Libellés et requêtes en français. Ça ne décide pas des catégories (elles viennent des données),
// ça traduit juste les mots-clés OSM courants ; les autres sont affichés tels quels, mis en forme.
const LABELS: Record<string, string | [label: string, query: string]> = {
  pizza: "Pizza", burger: "Burgers", sushi: "Sushis", japanese: ["Japonais", "restaurant japonais"],
  chinese: ["Chinois", "restaurant chinois"], italian: ["Italien", "restaurant italien"],
  french: ["Français", "restaurant français"], mexican: ["Mexicain", "restaurant mexicain"],
  indian: ["Indien", "restaurant indien"], thai: ["Thaï", "restaurant thaï"],
  vietnamese: ["Vietnamien", "restaurant vietnamien"], korean: ["Coréen", "restaurant coréen"],
  asian: ["Asiatique", "restaurant asiatique"], lebanese: ["Libanais", "restaurant libanais"],
  greek: ["Grec", "restaurant grec"], turkish: ["Turc", "restaurant turc"], kebab: "Kebab",
  sandwich: "Sandwichs", chicken: ["Poulet", "poulet frit"], breakfast: ["Petit-déjeuner", "petit-déjeuner"],
  brunch: "Brunch", crepe: "Crêpes", pancake: "Pancakes", seafood: ["Fruits de mer", "fruits de mer"],
  fish: ["Poisson", "restaurant de poisson"], steak_house: ["Grillades", "steakhouse"],
  regional: ["Cuisine du coin", "cuisine traditionnelle régionale"], tapas: "Tapas",
  spanish: ["Espagnol", "restaurant espagnol"], portuguese: ["Portugais", "restaurant portugais"],
  moroccan: ["Marocain", "restaurant marocain"], couscous: "Couscous", african: ["Africain", "restaurant africain"],
  ethiopian: ["Éthiopien", "restaurant éthiopien"], middle_eastern: ["Moyen-Orient", "restaurant libanais"],
  falafel: "Falafels", vegetarian: ["Végétarien", "restaurant végétarien"], vegan: ["Vegan", "restaurant vegan"],
  ramen: "Ramen", noodle: ["Nouilles", "nouilles"], dumplings: ["Raviolis", "raviolis dumplings"],
  bubble_tea: "Bubble tea", salad: "Salades", bagel: "Bagels", hot_dog: "Hot-dogs", fries: "Frites",
  poutine: "Poutine", bbq: ["Barbecue", "barbecue"], caribbean: ["Caribéen", "restaurant caribéen"],
  haitian: ["Haïtien", "restaurant haïtien"], peruvian: ["Péruvien", "restaurant péruvien"],
  brazilian: ["Brésilien", "restaurant brésilien"], belgian: ["Belge", "restaurant belge"],
  german: ["Allemand", "restaurant allemand"], polish: ["Polonais", "restaurant polonais"],
  pakistani: ["Pakistanais", "restaurant pakistanais"], nepalese: ["Népalais", "restaurant népalais"],
  taiwanese: ["Taïwanais", "restaurant taïwanais"], sichuan: ["Sichuan", "restaurant sichuanais"],
  brasserie: "Brasserie", bistro: "Bistrot", fine_dining: ["Gastronomique", "restaurant gastronomique"],
  basque: ["Basque", "restaurant basque"], savoyard: ["Savoyard", "fondue raclette"],
  galette: "Galettes", deli: ["Deli", "deli viande fumée"], smoked_meat: ["Smoked meat", "smoked meat"],
};

function labelFor(key: string): { label: string; query: string } {
  const known = LABELS[key];
  if (Array.isArray(known)) return { label: known[0], query: known[1] };
  if (known) return { label: known, query: known };
  const label = key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return { label, query: label };
}

const tiles = new Map<string, Promise<CuisineNode | null>>();

/** Fichier du carré de 10° (null hors des zones couvertes). */
function getTile(key: string): Promise<CuisineNode | null> {
  let tile = tiles.get(key);
  if (!tile) {
    tile = fetch(`/cuisines/${key}.json`).then((r) =>
      // Vite et Vercel renvoient la page d'accueil pour un fichier absent : on vérifie le type.
      r.ok && r.headers.get("content-type")?.includes("json") ? (r.json() as Promise<CuisineNode>) : null,
    );
    tile.catch(() => tiles.delete(key));
    tiles.set(key, tile);
  }
  return tile;
}

/**
 * Catégories de la zone visible : celles du pays/de la région/du quartier selon le zoom,
 * ou de la zone la plus fine disponible. D'abord les spécialités du coin, puis les plus courantes.
 */
export async function neighborhoodCategories(center: LatLng, radius: number): Promise<Category[]> {
  const tile = await getTile(cellKey(center.lat, center.lng, 0));
  if (!tile) return [];
  const node = findNode(tile, center.lat, center.lng, levelForRadius(radius));
  return node.categories.map(([key, distinctive]) => ({ key, ...labelFor(key), distinctive: distinctive === 1 }));
}
