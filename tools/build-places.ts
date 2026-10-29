/**
 * Découpe les restos d'OpenStreetMap en fichiers par zone pour le site : public/places/**.
 * Le site y cherche les 5 restos ouverts les plus proches, sans aucune API payante.
 *
 *   node tools/build-places.ts            (tous les pays de data/osm)
 *   node tools/build-places.ts canada     (seulement ces pays)
 *
 * Prérequis : les extraits data/osm/<pays>-restos.geojsonseq, produits par tools/build-cuisines.ts
 * (osmium + extraits Geofabrik). Les horaires manquants sont complétés par All The Places (sites des
 * enseignes, CC0), dont la dernière publication hebdomadaire est téléchargée toute seule (tools/alltheplaces.ts).
 * Fichiers sous licence ODbL (© contributeurs OSM).
 */
import { createReadStream, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import OpeningHours from "opening_hours";
import { cellKey, HOURS_SOURCE, LEVELS, MAX_PER_FILE, type PlaceRow, type PlacesIndex } from "../src/lib/placesGrid.ts";
import { atpRestaurants } from "./alltheplaces.ts";

const OSM_DIR = "data/osm";
const OUT_DIR = "public/places";

// Une semaine de référence sans jour férié ni changement d'heure : on en tire les horaires « types ».
const WEEK_START = new Date(2026, 1, 2); // lundi 2 février 2026, heure locale
const WEEK_END = new Date(2026, 1, 9);

/**
 * Lignes d'un fichier, coupées sur \n seulement : readline coupe aussi sur U+2028, que JSON autorise
 * dans une chaîne (des descriptions OSM en contiennent).
 */
async function* readLines(file: string): AsyncGenerator<string> {
  let rest = "";
  for await (const chunk of createReadStream(file, { encoding: "utf8" })) {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop()!;
    yield* lines;
  }
  if (rest) yield rest;
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

const minuteOfWeek = (d: Date) => Math.round((d.getTime() - WEEK_START.getTime()) / 60_000);

/**
 * Horaires OSM → intervalles en minutes depuis lundi 00:00. 0 si absents ou illisibles. Les ouvertures
 * sans heure de fin (« 18:00+ ») comptent comme ouvertes jusqu'à la fin estimée par la bibliothèque.
 */
function parseHours(value: unknown, stats: { ok: number; bad: number }): number[] | 0 {
  if (typeof value !== "string" || !value.trim()) return 0;
  try {
    const intervals = new OpeningHours(value, null, { tag_key: "opening_hours" }).getOpenIntervals(WEEK_START, WEEK_END);
    stats.ok++;
    return intervals.flatMap(([from, to]) => [minuteOfWeek(from), minuteOfWeek(to)]);
  } catch {
    stats.bad++;
    return 0;
  }
}

type Cell = { rows: PlaceRow[]; children: Map<string, Cell> };
const newCell = (): Cell => ({ rows: [], children: new Map() });

const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** Range un resto à tous les niveaux ; on décide à l'écriture où s'arrêter. */
function addRow(world: Map<string, Cell>, row: PlaceRow) {
  let level = world;
  for (let l = 0; l < LEVELS.length; l++) {
    const key = cellKey(row[1], row[2], l);
    let cell = level.get(key);
    if (!cell) level.set(key, (cell = newCell()));
    cell.rows.push(row);
    level = cell.children;
  }
}

// Rapprochement d'un resto All The Places avec son équivalent OSM : même enseigne (Wikidata) ou même nom, tout près.
const MATCH_BRAND_METERS = 150;
const MATCH_NAME_METERS = 100;
// Carrés de ~1 km pour chercher les voisins.
const MATCH_CELL = 0.01;
type MatchEntry = { row: PlaceRow; brand?: string; name: string };

/** Nom comparable : sans accents, casse, ponctuation ni espaces (« McDonald's » = « mcdonalds »). */
const normalize = (name: string) =>
  name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const matchKey = (lat: number, lng: number) => `${Math.floor(lat / MATCH_CELL)}_${Math.floor(lng / MATCH_CELL)}`;

function addToMatch(index: Map<string, MatchEntry[]>, entry: MatchEntry) {
  const key = matchKey(entry.row[1], entry.row[2]);
  const list = index.get(key);
  if (list) list.push(entry);
  else index.set(key, [entry]);
}

function meters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const x = (lng2 - lng1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  return 6_371_000 * Math.hypot(x, (lat2 - lat1) * r);
}

/** Le resto déjà connu le plus proche qui correspond, ou null. */
function findMatch(index: Map<string, MatchEntry[]>, lat: number, lng: number, brand: string | undefined, name: string) {
  let best: MatchEntry | null = null;
  let bestDistance = Infinity;
  const [i, j] = [Math.floor(lat / MATCH_CELL), Math.floor(lng / MATCH_CELL)];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      for (const entry of index.get(`${i + di}_${j + dj}`) ?? []) {
        const d = meters(lat, lng, entry.row[1], entry.row[2]);
        const same = (brand && entry.brand === brand && d < MATCH_BRAND_METERS) || (entry.name === name && d < MATCH_NAME_METERS);
        if (same && d < bestDistance) [best, bestDistance] = [entry, d];
      }
    }
  }
  return best;
}

const countries =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(OSM_DIR).filter((f) => f.endsWith("-restos.geojsonseq")).map((f) => f.replace("-restos.geojsonseq", ""));

const world = new Map<string, Cell>();
const matchIndex = new Map<string, MatchEntry[]>();
const stats = { ok: 0, bad: 0 };
let total = 0;
let closedForGood = 0;
for (const country of countries) {
  let n = 0;
  for await (const line of readLines(`${OSM_DIR}/${country}-restos.geojsonseq`)) {
    if (!line.trim()) continue;
    const feature = JSON.parse(line);
    const props = feature.properties ?? {};
    if ((props.amenity !== "restaurant" && props.amenity !== "fast_food") || !props.name) continue;
    const point = representativePoint(feature.geometry);
    if (!point) continue;
    const [lng, lat] = point;
    const hours = parseHours(props.opening_hours, stats);
    // Des horaires lisibles mais jamais ouverts (« off », « closed ») : resto fermé, on l'oublie.
    if (hours !== 0 && !hours.length) {
      closedForGood++;
      continue;
    }
    const cuisine = String(props.cuisine ?? "").split(";")[0].trim().toLowerCase();
    const row: PlaceRow = [props.name, round(lat), round(lng), hours];
    if (cuisine) row.push(cuisine);
    addRow(world, row);
    addToMatch(matchIndex, { row, brand: props["brand:wikidata"], name: normalize(props.name) });
    n++;
  }
  console.log(`${country} : ${n} restos`);
  total += n;
}

// All The Places : complète les horaires des restos OSM qui n'en ont pas, et ajoute les restos d'enseignes
// absents d'OSM, seulement dans les pays couverts (les carrés de 1° qui ont déjà des restos OSM).
const atp = await atpRestaurants();
const atpStats = { ok: 0, bad: 0 };
let filled = 0;
let added = 0;
for await (const line of readLines(atp.file)) {
  if (!line.trim()) continue;
  const feature = JSON.parse(line);
  const props = feature.properties ?? {};
  const name = props.name ?? props.brand;
  const point = feature.geometry && representativePoint(feature.geometry);
  if (!name || !point) continue;
  const [lng, lat] = point;
  if (!world.has(cellKey(lat, lng, 0))) continue;
  const hours = parseHours(props.opening_hours, atpStats);
  if (!hours || !hours.length) continue;

  const match = findMatch(matchIndex, lat, lng, props["brand:wikidata"], normalize(name));
  if (match) {
    // On ne remplace jamais des horaires OSM : ils ont été vérifiés sur place.
    if (match.row[3]) continue;
    match.row[3] = hours;
    match.row[4] ??= "";
    match.row[5] = HOURS_SOURCE.chain;
    filled++;
    continue;
  }
  const cuisine = String(props.cuisine ?? "").split(";")[0].trim().toLowerCase();
  const row: PlaceRow = [name, round(lat), round(lng), hours, cuisine, HOURS_SOURCE.chain];
  addRow(world, row);
  // Une même adresse peut venir de deux collectes : la deuxième trouvera la première.
  addToMatch(matchIndex, { row, brand: props["brand:wikidata"], name: normalize(name) });
  added++;
}
console.log(`All The Places (${atp.run}) : horaires ajoutés à ${filled} restos OSM, ${added} restos ajoutés`);
total += added;

rmSync(OUT_DIR, { recursive: true, force: true });
const split: string[] = [];
let files = 0;
function write(cells: Map<string, Cell>, level: number) {
  mkdirSync(`${OUT_DIR}/${level}`, { recursive: true });
  for (const [key, cell] of cells) {
    if (cell.rows.length > MAX_PER_FILE && level < LEVELS.length - 1) {
      split.push(`${level}:${key}`);
      write(cell.children, level + 1);
    } else {
      writeFileSync(`${OUT_DIR}/${level}/${key}.json`, JSON.stringify(cell.rows));
      files++;
    }
  }
}
write(world, 0);

// La version, ajoutée aux URLs par le site : le navigateur ignore ses anciennes copies après un nouveau calcul.
const index: PlacesIndex = { version: Date.now().toString(36), split: split.sort() };
writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify(index));
writeFileSync(
  `${OUT_DIR}/README.md`,
  `# Restos par zone\n\nGénéré par \`tools/build-places.ts\` le ${new Date().toISOString().slice(0, 10)} ` +
    `à partir d'OpenStreetMap (${countries.join(", ")}) et de All The Places (publication ${atp.run}).\n\n` +
    `Données © contributeurs OpenStreetMap, disponibles sous licence ODbL : https://www.openstreetmap.org/copyright\n` +
    `Horaires des enseignes : All The Places (https://alltheplaces.xyz), sous CC0.\n`,
);
const withHours = stats.ok - closedForGood + filled + added;
console.log(`${total} restos, ${Math.round((100 * withHours) / total)} % avec des horaires (${stats.bad} illisibles, ${closedForGood} jamais ouverts écartés)`);
console.log(`${files} fichiers et ${split.length} carrés découpés dans ${OUT_DIR}/`);
