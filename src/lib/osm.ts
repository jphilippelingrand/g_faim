import { lang } from "../i18n";
import { cellKey, findPath, levelForRadius, type CategoryEntry, type CuisineNode } from "./cuisineGrid";
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
  emoji: string;
  /** Nettement plus présente ici qu'en moyenne dans le monde. */
  distinctive: boolean;
};

// Libellés et requêtes par langue. Ça ne décide pas des catégories (elles viennent des données),
// ça traduit juste les mots-clés OSM courants ; les autres sont affichés tels quels, mis en forme.
// Format : [emoji, libellé fr, libellé en, libellé es] ; la requête Google est « restaurant <libellé> »
// pour les nationalités (R), sinon le libellé lui-même.
const R = true;
const LABELS: Record<string, [emoji: string, fr: string, en: string, es: string, nationality?: boolean]> = {
  pizza: ["🍕", "Pizza", "Pizza", "Pizza"],
  burger: ["🍔", "Burgers", "Burgers", "Hamburguesas"],
  sushi: ["🍣", "Sushis", "Sushi", "Sushi"],
  japanese: ["🍱", "Japonais", "Japanese", "Japonés", R],
  chinese: ["🥡", "Chinois", "Chinese", "Chino", R],
  italian: ["🍝", "Italien", "Italian", "Italiano", R],
  french: ["🥖", "Français", "French", "Francés", R],
  mexican: ["🌮", "Mexicain", "Mexican", "Mexicano", R],
  indian: ["🍛", "Indien", "Indian", "Indio", R],
  thai: ["🌶️", "Thaï", "Thai", "Tailandés", R],
  vietnamese: ["🍜", "Vietnamien", "Vietnamese", "Vietnamita", R],
  korean: ["🍲", "Coréen", "Korean", "Coreano", R],
  asian: ["🥢", "Asiatique", "Asian", "Asiático", R],
  lebanese: ["🧆", "Libanais", "Lebanese", "Libanés", R],
  greek: ["🥙", "Grec", "Greek", "Griego", R],
  turkish: ["🥙", "Turc", "Turkish", "Turco", R],
  spanish: ["🥘", "Espagnol", "Spanish", "Español", R],
  portuguese: ["🐟", "Portugais", "Portuguese", "Portugués", R],
  moroccan: ["🍲", "Marocain", "Moroccan", "Marroquí", R],
  african: ["🍲", "Africain", "African", "Africano", R],
  ethiopian: ["🍲", "Éthiopien", "Ethiopian", "Etíope", R],
  caribbean: ["🌴", "Caribéen", "Caribbean", "Caribeño", R],
  haitian: ["🌴", "Haïtien", "Haitian", "Haitiano", R],
  peruvian: ["🌶️", "Péruvien", "Peruvian", "Peruano", R],
  brazilian: ["🍖", "Brésilien", "Brazilian", "Brasileño", R],
  belgian: ["🍟", "Belge", "Belgian", "Belga", R],
  german: ["🥨", "Allemand", "German", "Alemán", R],
  polish: ["🥟", "Polonais", "Polish", "Polaco", R],
  pakistani: ["🍛", "Pakistanais", "Pakistani", "Pakistaní", R],
  nepalese: ["🥟", "Népalais", "Nepalese", "Nepalí", R],
  taiwanese: ["🧋", "Taïwanais", "Taiwanese", "Taiwanés", R],
  sichuan: ["🌶️", "Sichuan", "Sichuan", "Sichuan", R],
  basque: ["🍷", "Basque", "Basque", "Vasco", R],
  middle_eastern: ["🧆", "Moyen-Orient", "Middle Eastern", "Oriente Medio", R],
  vegetarian: ["🥗", "Végétarien", "Vegetarian", "Vegetariano", R],
  vegan: ["🌱", "Vegan", "Vegan", "Vegano", R],
  kebab: ["🥙", "Kebab", "Kebab", "Kebab"],
  sandwich: ["🥪", "Sandwichs", "Sandwiches", "Bocadillos"],
  chicken: ["🍗", "Poulet", "Chicken", "Pollo"],
  breakfast: ["🍳", "Petit-déj", "Breakfast", "Desayuno"],
  brunch: ["🥞", "Brunch", "Brunch", "Brunch"],
  crepe: ["🥞", "Crêpes", "Crêpes", "Crepes"],
  galette: ["🥞", "Galettes", "Galettes", "Galettes"],
  pancake: ["🥞", "Pancakes", "Pancakes", "Tortitas"],
  seafood: ["🦞", "Fruits de mer", "Seafood", "Marisco"],
  fish: ["🐟", "Poisson", "Fish", "Pescado"],
  steak_house: ["🥩", "Grillades", "Steakhouse", "Asador"],
  regional: ["📍", "Cuisine du coin", "Local cuisine", "Cocina local"],
  tapas: ["🫒", "Tapas", "Tapas", "Tapas"],
  couscous: ["🍲", "Couscous", "Couscous", "Cuscús"],
  falafel: ["🧆", "Falafels", "Falafel", "Falafel"],
  ramen: ["🍜", "Ramen", "Ramen", "Ramen"],
  noodle: ["🍜", "Nouilles", "Noodles", "Fideos"],
  dumplings: ["🥟", "Raviolis", "Dumplings", "Dumplings"],
  bubble_tea: ["🧋", "Bubble tea", "Bubble tea", "Bubble tea"],
  salad: ["🥗", "Salades", "Salads", "Ensaladas"],
  bagel: ["🥯", "Bagels", "Bagels", "Bagels"],
  hot_dog: ["🌭", "Hot-dogs", "Hot dogs", "Perritos"],
  fries: ["🍟", "Frites", "Fries", "Patatas fritas"],
  poutine: ["🍟", "Poutine", "Poutine", "Poutine"],
  bbq: ["🍖", "Barbecue", "BBQ", "Barbacoa"],
  brasserie: ["🍺", "Brasserie", "Brasserie", "Brasserie"],
  bistro: ["🍷", "Bistrot", "Bistro", "Bistró"],
  fine_dining: ["🍽️", "Gastronomique", "Fine dining", "Alta cocina"],
  savoyard: ["🧀", "Savoyard", "Savoyard", "Saboyano", R],
  deli: ["🥪", "Deli", "Deli", "Charcutería"],
  smoked_meat: ["🥩", "Smoked meat", "Smoked meat", "Smoked meat"],
  shawarma: ["🥙", "Shawarma", "Shawarma", "Shawarma"],
  barbecue: ["🍖", "Barbecue", "BBQ", "Barbacoa"],
};

const RESTAURANT = { fr: "restaurant", en: "restaurant", es: "restaurante" };

function labelFor(key: string): { emoji: string; label: string; query: string } {
  const known = LABELS[key];
  if (!known) {
    const label = key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    return { emoji: "🍽️", label, query: label };
  }
  const [emoji, fr, en, es, nationality] = known;
  const label = { fr, en, es }[lang];
  // « restaurant japonais » / « Japanese restaurant » / « restaurante japonés »
  const query = !nationality ? label : lang === "en" ? `${label} ${RESTAURANT.en}` : `${RESTAURANT[lang]} ${label.toLowerCase()}`;
  return { emoji, label, query };
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

// Une rangée de boutons, sans défilement : 4 cuisines au plus.
export const MAX_SHOWN = 4;

/**
 * Catégories de la zone visible (pays, région ou quartier selon le zoom, ou la zone la plus fine
 * disponible) : d'abord ses spécialités, puis celles de sa région directe (la poutine de Montréal
 * reste visible au Plateau), puis ses cuisines les plus courantes. On n'hérite jamais du carré de 10° :
 * il couvre plusieurs provinces, ses spécialités remonteraient partout (la poutine à Toronto).
 */
export async function neighborhoodCategories(center: LatLng, radius: number): Promise<Category[]> {
  const tile = await getTile(cellKey(center.lat, center.lng, 0));
  if (!tile) return [];
  const path = findPath(tile, center.lat, center.lng, levelForRadius(radius));
  const zone = path[path.length - 1];
  const region = path.length > 2 ? path[path.length - 2] : null;

  const specialties = (node: CuisineNode | null) => node?.categories.filter(([, d]) => d === 1) ?? [];
  const ordered: CategoryEntry[] = [
    ...specialties(zone),
    ...specialties(region),
    ...zone.categories.filter(([, d]) => d !== 1),
  ];
  const seen = new Set<string>();
  const result: Category[] = [];
  for (const [key, distinctive] of ordered) {
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ key, ...labelFor(key), distinctive: distinctive === 1 });
  }
  return result.slice(0, MAX_SHOWN);
}
