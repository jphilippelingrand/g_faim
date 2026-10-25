/**
 * Calcule les catégories de cuisine par zone à partir d'OpenStreetMap et écrit public/cuisines/*.json.
 *
 *   node tools/build-cuisines.ts            (pays de CONFIG)
 *   node tools/build-cuisines.ts canada     (seulement ces pays)
 *
 * Prérequis : osmium (brew install osmium-tool) et les extraits Geofabrik dans data/osm/<pays>.osm.pbf.
 * À relancer tous les ~6 mois. Les fichiers produits sont sous licence ODbL (© contributeurs OSM).
 */
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { cellKey, LEVELS, type CategoryEntry, type CuisineNode } from "../src/lib/cuisineGrid.ts";

const CONFIG = {
  countries: ["france", "canada"],
  // Une région de 0,5° avec au moins ce nombre de restos est découpée en quartiers de 0,05° (~5 km) :
  // toutes les grandes villes, sans liste à tenir à jour.
  refineMinRestaurants: 500,
  // Zones à découper quand même, sous le seuil : [lat min, lng min, lat max, lng max].
  refine: [
    { name: "Montréal", bbox: [45.4, -73.98, 45.71, -73.47] },
    { name: "Pays basque", bbox: [42.95, -1.8, 43.6, -0.9] },
  ],
  // En dessous, une sous-zone n'est pas créée : trop peu de restos pour des catégories fiables.
  minRestaurants: 30,
};

const OSM_DIR = "data/osm";
const OUT_DIR = "public/cuisines";
const TAGINFO_URL =
  "https://taginfo.openstreetmap.org/api/4/key/values?key=cuisine&page=1&rp=999&sortname=count&sortorder=desc";

const MAX_CATEGORIES = 8;
const MAX_DISTINCTIVE = 3;
// Plus de N fois plus présente qu'en moyenne mondiale → spécialité du coin.
const DISTINCTIVE_LIFT = 2.5;
const MIN_COUNT = 3;
// Trop vagues ou pas de la restauration.
const IGNORED = new Set(["yes", "coffee_shop", "ice_cream", "cake", "donut", "tea", "juice", "international", "local"]);

type Counts = Map<string, number>;
type Tree = { count: number; cuisines: Counts; children: Map<string, Tree>; forced?: boolean };

const newTree = (): Tree => ({ count: 0, cuisines: new Map(), children: new Map() });

function inRefinedArea(lat: number, lng: number): boolean {
  return CONFIG.refine.some(({ bbox: [s, w, n, e] }) => lat >= s && lat <= n && lng >= w && lng <= e);
}

/** Point représentatif d'une entité GeoJSON : le point lui-même, ou la moyenne des sommets. */
function representativePoint(geometry: { type: string; coordinates: unknown }): [lng: number, lat: number] | null {
  if (geometry.type === "Point") return geometry.coordinates as [number, number];
  const flat: number[][] = [];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number") flat.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geometry.coordinates);
  if (!flat.length) return null;
  return [flat.reduce((s, p) => s + p[0], 0) / flat.length, flat.reduce((s, p) => s + p[1], 0) / flat.length];
}

/** Extrait les restos d'un pays avec osmium (mis en cache dans data/osm). */
function extractRestaurants(country: string): string {
  const pbf = `${OSM_DIR}/${country}.osm.pbf`;
  const filtered = `${OSM_DIR}/${country}-restos.osm.pbf`;
  const out = `${OSM_DIR}/${country}-restos.geojsonseq`;
  if (!existsSync(pbf)) throw new Error(`${pbf} introuvable : télécharge l'extrait Geofabrik.`);
  if (!existsSync(out)) {
    console.log(`  osmium : filtre des restos de ${country}…`);
    execFileSync("osmium", ["tags-filter", pbf, "nwr/amenity=restaurant,fast_food", "-o", filtered, "--overwrite"], { stdio: "inherit" });
    execFileSync("osmium", ["export", filtered, "-f", "geojsonseq", "--format-option", "print_record_separator=false", "-o", out, "--overwrite"], { stdio: "inherit" });
    rmSync(filtered);
  }
  return out;
}

async function addCountry(tiles: Map<string, Tree>, country: string): Promise<number> {
  const file = extractRestaurants(country);
  let n = 0;
  for await (const line of createInterface({ input: createReadStream(file) })) {
    if (!line.trim()) continue;
    const feature = JSON.parse(line);
    const props = feature.properties ?? {};
    if (props.amenity !== "restaurant" && props.amenity !== "fast_food") continue;
    const cuisines = String(props.cuisine ?? "")
      .split(";")
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c && !IGNORED.has(c));
    if (!cuisines.length) continue;
    const point = representativePoint(feature.geometry);
    if (!point) continue;
    const [lng, lat] = point;

    // Le resto compte dans sa zone à chaque niveau ; on décide à l'écriture où garder le plus fin.
    const forced = inRefinedArea(lat, lng);
    let level: Map<string, Tree> = tiles;
    for (let l = 0; l < LEVELS.length; l++) {
      const key = cellKey(lat, lng, l);
      let node = level.get(key);
      if (!node) level.set(key, (node = newTree()));
      node.count++;
      if (forced) node.forced = true;
      for (const c of cuisines) node.cuisines.set(c, (node.cuisines.get(c) ?? 0) + 1);
      level = node.children;
    }
    n++;
  }
  return n;
}

type Baseline = { counts: Map<string, number>; total: number; floor: number };

async function worldBaseline(): Promise<Baseline> {
  const cache = `${OSM_DIR}/taginfo-cuisine.json`;
  if (!existsSync(cache)) writeFileSync(cache, await (await fetch(TAGINFO_URL)).text());
  const json: { data: { value: string; count: number }[] } = JSON.parse(readFileSync(cache, "utf8"));
  return {
    counts: new Map(json.data.map((d) => [d.value, d.count])),
    total: json.data.reduce((s, d) => s + d.count, 0),
    // Une cuisine absente du top 999 mondial est au plus aussi fréquente que la 999e.
    floor: json.data.at(-1)?.count ?? 1,
  };
}

/** D'abord les spécialités du coin (sur-représentées par rapport au monde), puis les plus courantes. */
function categoriesFor(cuisines: Counts, world: Baseline): CategoryEntry[] {
  const total = [...cuisines.values()].reduce((a, b) => a + b, 0);
  const scored = [...cuisines.entries()]
    .filter(([, count]) => count >= MIN_COUNT)
    .map(([key, count]) => ({ key, count, lift: count / total / ((world.counts.get(key) ?? world.floor) / world.total) }));
  const distinctive = scored
    .filter((c) => c.lift >= DISTINCTIVE_LIFT)
    .sort((a, b) => b.count * Math.log(b.lift) - a.count * Math.log(a.lift))
    .slice(0, MAX_DISTINCTIVE);
  const common = scored
    .filter((c) => !distinctive.includes(c))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_CATEGORIES - distinctive.length);
  return [...distinctive.map((c): CategoryEntry => [c.key, 1]), ...common.map((c): CategoryEntry => [c.key])];
}

function toNode(tree: Tree, world: Baseline, level = 0): CuisineNode {
  const node: CuisineNode = { count: tree.count, categories: categoriesFor(tree.cuisines, world) };
  // Les régions (niveau 1) ne sont découpées en quartiers que si elles sont denses ou forcées.
  const split = level === 0 || (level === 1 && (tree.count >= CONFIG.refineMinRestaurants || tree.forced));
  const subs = split ? [...tree.children].filter(([, child]) => child.count >= CONFIG.minRestaurants) : [];
  if (subs.length) {
    node.sub_regions = Object.fromEntries(subs.sort().map(([k, child]) => [k, toNode(child, world, level + 1)]));
  }
  return node;
}

const world = await worldBaseline();
const tiles = new Map<string, Tree>();
const countries = process.argv.length > 2 ? process.argv.slice(2) : CONFIG.countries;
for (const country of countries) {
  console.log(`${country}…`);
  console.log(`  ${await addCountry(tiles, country)} restos avec une cuisine renseignée`);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
let written = 0;
for (const [key, tree] of tiles) {
  if (tree.count < CONFIG.minRestaurants) continue;
  writeFileSync(`${OUT_DIR}/${key}.json`, JSON.stringify(toNode(tree, world)));
  written++;
}
writeFileSync(
  `${OUT_DIR}/README.md`,
  `# Catégories de cuisine par zone\n\nGénéré par \`tools/build-cuisines.ts\` le ${new Date().toISOString().slice(0, 10)} ` +
    `à partir d'OpenStreetMap (${countries.join(", ")}).\n\n` +
    `Données © contributeurs OpenStreetMap, disponibles sous licence ODbL : https://www.openstreetmap.org/copyright\n`,
);
console.log(`${written} fichiers écrits dans ${OUT_DIR}/`);
