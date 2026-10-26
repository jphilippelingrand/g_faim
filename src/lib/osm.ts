import { lang } from "../i18n";
import { cellKey, findPath, levelForRadius, type CategoryEntry, type CuisineNode } from "./cuisineGrid";
import { CUISINES_VERSION } from "./cuisinesVersion";
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
  portuguese: ["🍗", "Portugais", "Portuguese", "Portugués", R],
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
  tibetan: ["🥟", "Tibétain", "Tibetan", "Tibetano", R],
  canadian: ["🍁", "Canadien", "Canadian", "Canadiense", R],
  mediterranean: ["🫒", "Méditerranéen", "Mediterranean", "Mediterráneo", R],
  pita: ["🥙", "Pita", "Pita", "Pita"],
  american: ["🍔", "Américain", "American", "Americano", R],
  tacos: ["🌮", "Tacos", "Tacos", "Tacos"],
  french_tacos: ["🌯", "French tacos", "French tacos", "French tacos"],
  tex_mex: ["🌮", "Tex-Mex", "Tex-Mex", "Tex-Mex"],
  pasta: ["🍝", "Pâtes", "Pasta", "Pasta"],
  fish_and_chips: ["🐟", "Fish & chips", "Fish & chips", "Fish & chips"],
  friture: ["🍟", "Friterie", "Chip shop", "Freiduría"],
  grill: ["🔥", "Grillades", "Grill", "Parrilla"],
  bar_and_grill: ["🍖", "Bar & grill", "Bar & grill", "Bar & grill"],
  diner: ["🍳", "Diner", "Diner", "Diner"],
  panini: ["🥪", "Panini", "Panini", "Panini"],
  filipino: ["🍚", "Philippin", "Filipino", "Filipino", R],
  donair: ["🥙", "Donair", "Donair", "Donair"],
  poke: ["🥗", "Poké", "Poke", "Poke"],
  bowl: ["🥗", "Bowls", "Bowls", "Bowls"],
  wings: ["🍗", "Ailes de poulet", "Wings", "Alitas"],
  jamaican: ["🌴", "Jamaïcain", "Jamaican", "Jamaicano", R],
  oriental: ["🧆", "Oriental", "Middle Eastern", "Oriental", R],
  tunisian: ["🍲", "Tunisien", "Tunisian", "Tunecino", R],
  arab: ["🧆", "Arabe", "Arab", "Árabe", R],
  syrian: ["🧆", "Syrien", "Syrian", "Sirio", R],
  persian: ["🍢", "Persan", "Persian", "Persa", R],
  armenian: ["🍢", "Arménien", "Armenian", "Armenio", R],
  serbian: ["🍖", "Serbe", "Serbian", "Serbio", R],
  ukrainian: ["🥟", "Ukrainien", "Ukrainian", "Ucraniano", R],
  soup: ["🍜", "Soupes", "Soup", "Sopas"],
  waffle: ["🧇", "Gaufres", "Waffles", "Gofres"],
  corsican: ["🧀", "Corse", "Corsican", "Corso", R],
  alsatian: ["🥨", "Alsacien", "Alsatian", "Alsaciano", R],
  tarte_flambee: ["🥧", "Tarte flambée", "Tarte flambée", "Tarte flambée"],
  latin_american: ["🌶️", "Latino", "Latin American", "Latinoamericano", R],
  senegalese: ["🍲", "Sénégalais", "Senegalese", "Senegalés", R],
  eritrean: ["🍲", "Érythréen", "Eritrean", "Eritreo", R],
  creole: ["🌶️", "Créole", "Creole", "Criollo", R],
  reunionese: ["🌴", "Réunionnais", "Réunionese", "Reunionés", R],
  cajun: ["🌶️", "Cajun", "Cajun", "Cajún"],
  hotpot: ["🍲", "Fondue chinoise", "Hot pot", "Hot pot"],
  dim_sum: ["🥟", "Dim sum", "Dim sum", "Dim sum"],
  cantonese: ["🥡", "Cantonais", "Cantonese", "Cantonés", R],
  hakka: ["🥡", "Hakka", "Hakka", "Hakka", R],
  malaysian: ["🍛", "Malaisien", "Malaysian", "Malasio", R],
  singaporean: ["🍜", "Singapourien", "Singaporean", "Singapurense", R],
  cambodian: ["🍜", "Cambodgien", "Cambodian", "Camboyano", R],
  bangladeshi: ["🍛", "Bangladais", "Bangladeshi", "Bangladesí", R],
  pho: ["🍜", "Phở", "Phở", "Phở"],
  naan: ["🫓", "Naan", "Naan", "Naan"],
  maple: ["🍁", "Érable", "Maple", "Arce"],
  quebec: ["🍁", "Québécois", "Québécois", "Quebequense", R],
  crousty: ["🍗", "Crousty", "Crousty", "Crousty"],
  rotisserie: ["🍗", "Rôtisserie", "Rotisserie", "Pollos asados"],
  pie: ["🥧", "Tourtes", "Pies", "Pasteles"],
  oyster: ["🦪", "Huîtres", "Oysters", "Ostras"],
  panisses: ["🍟", "Panisses", "Panisses", "Panisses"],
  "croque-monsieur": ["🥪", "Croque-monsieur", "Croque-monsieur", "Croque-monsieur"],
  // États-Unis
  hawaiian: ["🌺", "Hawaïen", "Hawaiian", "Hawaiano", R],
  southern: ["🍗", "Cuisine du Sud", "Southern", "Comida sureña"],
  soul_food: ["🍗", "Soul food", "Soul food", "Soul food"],
  lowcountry: ["🦐", "Lowcountry", "Lowcountry", "Lowcountry"],
  new_mexican: ["🌶️", "Néo-mexicain", "New Mexican", "Nuevomexicano", R],
  southwestern: ["🌵", "Sud-Ouest américain", "Southwestern", "Del suroeste", R],
  californian: ["🥑", "Californien", "Californian", "Californiano", R],
  chili: ["🌶️", "Chili", "Chili", "Chili"],
  cheesesteak: ["🥪", "Cheesesteak", "Cheesesteak", "Cheesesteak"],
  kolache: ["🥐", "Kolaches", "Kolaches", "Kolaches"],
  catfish: ["🐟", "Poisson-chat", "Catfish", "Bagre"],
  crab: ["🦀", "Crabe", "Crab", "Cangrejo"],
  lobster: ["🦞", "Homard", "Lobster", "Langosta"],
  shrimp: ["🦐", "Crevettes", "Shrimp", "Gambas"],
  crawfish: ["🦞", "Écrevisses", "Crawfish", "Cangrejos de río"],
  teriyaki: ["🍱", "Teriyaki", "Teriyaki", "Teriyaki"],
  hibachi: ["🔥", "Teppanyaki", "Hibachi", "Teppanyaki"],
  burrito: ["🌯", "Burritos", "Burritos", "Burritos"],
  "açaí": ["🫐", "Açaí", "Açaí", "Açaí"],
  fried_dough: ["🍩", "Beignets", "Fried dough", "Buñuelos"],
  cuban: ["🌴", "Cubain", "Cuban", "Cubano", R],
  salvadoran: ["🫓", "Salvadorien", "Salvadoran", "Salvadoreño", R],
  puerto_rican: ["🌴", "Portoricain", "Puerto Rican", "Puertorriqueño", R],
  dominican: ["🌴", "Dominicain", "Dominican", "Dominicano", R],
  guyanese: ["🌴", "Guyanien", "Guyanese", "Guyanés", R],
  honduran: ["🫓", "Hondurien", "Honduran", "Hondureño", R],
  nicaraguan: ["🫓", "Nicaraguayen", "Nicaraguan", "Nicaragüense", R],
  colombian: ["🫓", "Colombien", "Colombian", "Colombiano", R],
  venezuelan: ["🫓", "Vénézuélien", "Venezuelan", "Venezolano", R],
  ecuadorian: ["🌶️", "Équatorien", "Ecuadorian", "Ecuatoriano", R],
  argentinian: ["🥩", "Argentin", "Argentinian", "Argentino", R],
  empanada: ["🥟", "Empanadas", "Empanadas", "Empanadas"],
  // Royaume-Uni et Irlande
  british: ["🫖", "Britannique", "British", "Británico", R],
  irish: ["☘️", "Irlandais", "Irish", "Irlandés", R],
  pie_and_mash: ["🥧", "Pie and mash", "Pie and mash", "Pie and mash"],
  pasty: ["🥟", "Pasties", "Pasties", "Pasties"],
  curry: ["🍛", "Curry", "Curry", "Curry"],
  // Allemagne et Autriche
  bavarian: ["🥨", "Bavarois", "Bavarian", "Bávaro", R],
  swabian: ["🍝", "Souabe", "Swabian", "Suabo", R],
  franconian: ["🍺", "Franconien", "Franconian", "Franconio", R],
  hessian: ["🍎", "Hessois", "Hessian", "Hesiano", R],
  thuringian: ["🌭", "Thuringien", "Thuringian", "Turingio", R],
  austrian: ["🥩", "Autrichien", "Austrian", "Austriaco", R],
  pretzel: ["🥨", "Bretzels", "Pretzels", "Pretzels"],
  sausage: ["🌭", "Saucisses", "Sausages", "Salchichas"],
  currywurst: ["🌭", "Currywurst", "Currywurst", "Currywurst"],
  schnitzel: ["🥩", "Schnitzel", "Schnitzel", "Escalope"],
  brotzeit: ["🥨", "Brotzeit", "Brotzeit", "Brotzeit"],
  buschenschank: ["🍷", "Buschenschank", "Buschenschank", "Buschenschank"],
  alpine_hut: ["🏔️", "Refuge", "Alpine hut", "Refugio"],
  // Espagne
  catalan: ["🥘", "Catalan", "Catalan", "Catalán", R],
  galician: ["🐙", "Galicien", "Galician", "Gallego", R],
  asturian: ["🍏", "Asturien", "Asturian", "Asturiano", R],
  valencian: ["🥘", "Valencien", "Valencian", "Valenciano", R],
  basque_ciderhouse: ["🍏", "Cidrerie basque", "Basque cider house", "Sidrería"],
  paella: ["🥘", "Paella", "Paella", "Paella"],
  churro: ["🥖", "Churros", "Churros", "Churros"],
  "calçotada": ["🧅", "Calçotada", "Calçotada", "Calçotada"],
  brasas: ["🔥", "Grillades", "Grill", "Brasas"],
  // Italie
  sardinian: ["🐑", "Sarde", "Sardinian", "Sardo", R],
  sicilian: ["🍋", "Sicilien", "Sicilian", "Siciliano", R],
  ligurian: ["🌿", "Ligure", "Ligurian", "Ligur", R],
  piedmontese: ["🍷", "Piémontais", "Piedmontese", "Piamontés", R],
  emilian: ["🍝", "Émilien", "Emilian", "Emiliano", R],
  piadina: ["🫓", "Piadina", "Piadina", "Piadina"],
  "5_e_5": ["🥪", "Cinque e cinque", "Cinque e cinque", "Cinque e cinque"],
  // Europe centrale et de l'Est, Balkans
  balkan: ["🍖", "Balkanique", "Balkan", "Balcánico", R],
  croatian: ["🐟", "Croate", "Croatian", "Croata", R],
  czech: ["🍺", "Tchèque", "Czech", "Checo", R],
  hungarian: ["🌶️", "Hongrois", "Hungarian", "Húngaro", R],
  russian: ["🥟", "Russe", "Russian", "Ruso", R],
  jewish: ["🥯", "Juif", "Jewish", "Judío", R],
  // Asie, Moyen-Orient, Afrique
  afghan: ["🍢", "Afghan", "Afghan", "Afgano", R],
  uzbek: ["🍚", "Ouzbek", "Uzbek", "Uzbeko", R],
  mongolian: ["🔥", "Mongol", "Mongolian", "Mongol", R],
  burmese: ["🍜", "Birman", "Burmese", "Birmano", R],
  indonesian: ["🍛", "Indonésien", "Indonesian", "Indonesio", R],
  sri_lankan: ["🍛", "Sri-lankais", "Sri Lankan", "Esrilanqués", R],
  iraqi: ["🍢", "Irakien", "Iraqi", "Iraquí", R],
  egyptian: ["🧆", "Égyptien", "Egyptian", "Egipcio", R],
  sudanese: ["🍲", "Soudanais", "Sudanese", "Sudanés", R],
  somali: ["🍲", "Somalien", "Somali", "Somalí", R],
  nigerian: ["🍲", "Nigérian", "Nigerian", "Nigeriano", R],
  gyros: ["🥙", "Gyros", "Gyros", "Gyros"],
  lahmacun: ["🫓", "Lahmacun", "Lahmacun", "Lahmacun"],
  // Japon
  beef_bowl: ["🍚", "Gyūdon", "Gyudon", "Gyudon"],
  soba: ["🍜", "Soba", "Soba", "Soba"],
  udon: ["🍜", "Udon", "Udon", "Udon"],
  gyoza: ["🥟", "Gyoza", "Gyoza", "Gyozas"],
  yakiniku: ["🥩", "Yakiniku", "Yakiniku", "Yakiniku"],
  okonomiyaki: ["🥞", "Okonomiyaki", "Okonomiyaki", "Okonomiyaki"],
  takoyaki: ["🐙", "Takoyaki", "Takoyaki", "Takoyaki"],
  izakaya: ["🍶", "Izakaya", "Izakaya", "Izakaya"],
  unagi: ["🐟", "Anguille", "Unagi", "Anguila"],
  yakitori: ["🍢", "Yakitori", "Yakitori", "Yakitori"],
  tonkatsu: ["🍖", "Tonkatsu", "Tonkatsu", "Tonkatsu"],
  tempura: ["🍤", "Tempura", "Tempura", "Tempura"],
  bento: ["🍱", "Bento", "Bento", "Bento"],
  onigiri: ["🍙", "Onigiri", "Onigiri", "Onigiri"],
  soup_curry: ["🍛", "Soupe au curry", "Soup curry", "Sopa de curry"],
  yoshoku: ["🍛", "Yōshoku", "Yoshoku", "Yoshoku"],
  okinawan: ["🌺", "Okinawaïen", "Okinawan", "Okinawense", R],
  yakisoba: ["🍜", "Yakisoba", "Yakisoba", "Yakisoba"],
  fugu: ["🐡", "Fugu", "Fugu", "Fugu"],
  // Mexique
  carnitas: ["🌮", "Carnitas", "Carnitas", "Carnitas"],
  tamales: ["🫔", "Tamales", "Tamales", "Tamales"],
  tortas: ["🥪", "Tortas", "Tortas", "Tortas"],
  gorditas: ["🫓", "Gorditas", "Gorditas", "Gorditas"],
  antojitos: ["🌮", "Antojitos", "Antojitos", "Antojitos"],
  lonches: ["🥪", "Lonches", "Lonches", "Lonches"],
  marquesitas: ["🌯", "Marquesitas", "Marquesitas", "Marquesitas"],
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
    tile = fetch(`/cuisines/${key}.json?v=${CUISINES_VERSION}`).then((r) =>
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
 * disponible). Le plus local prime : d'abord les spécialités de la zone, puis celles des zones qui la
 * contiennent (la ville, puis la grande région), qui ne font que compléter ; enfin ses cuisines les
 * plus courantes.
 */
export async function neighborhoodCategories(center: LatLng, radius: number): Promise<Category[]> {
  const tile = await getTile(cellKey(center.lat, center.lng, 0));
  if (!tile) return [];
  const path = findPath(tile, center.lat, center.lng, levelForRadius(radius));
  const zone = path[path.length - 1];

  const ordered: CategoryEntry[] = [
    ...[...path].reverse().flatMap((node) => node.categories.filter(([, d]) => d === 1)),
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
