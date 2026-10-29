/**
 * Découpe les restos d'OpenStreetMap en fichiers par zone pour le site : public/places/**.
 * Le site y cherche les 5 restos ouverts les plus proches, sans aucune API payante.
 *
 *   node tools/build-places.ts            (tous les pays de data/osm)
 *   node tools/build-places.ts canada     (seulement ces pays)
 *
 * Prérequis : les extraits data/osm/<pays>-restos.geojsonseq, produits par tools/build-cuisines.ts
 * (osmium + extraits Geofabrik). À relancer avec eux. Fichiers sous licence ODbL (© contributeurs OSM).
 */
import { createReadStream, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import OpeningHours from "opening_hours";
import { cellKey, LEVELS, MAX_PER_FILE, type PlaceRow, type PlacesIndex } from "../src/lib/placesGrid.ts";

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

const countries =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(OSM_DIR).filter((f) => f.endsWith("-restos.geojsonseq")).map((f) => f.replace("-restos.geojsonseq", ""));

// Chaque resto est rangé à tous les niveaux ; on décide à l'écriture où s'arrêter.
const world = new Map<string, Cell>();
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

    let level = world;
    for (let l = 0; l < LEVELS.length; l++) {
      const key = cellKey(lat, lng, l);
      let cell = level.get(key);
      if (!cell) level.set(key, (cell = newCell()));
      cell.rows.push(row);
      level = cell.children;
    }
    n++;
  }
  console.log(`${country} : ${n} restos`);
  total += n;
}

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
    `à partir d'OpenStreetMap (${countries.join(", ")}).\n\n` +
    `Données © contributeurs OpenStreetMap, disponibles sous licence ODbL : https://www.openstreetmap.org/copyright\n`,
);
const share = Math.round((100 * stats.ok) / total);
console.log(`${total} restos, ${share} % avec des horaires lisibles (${stats.bad} illisibles, ${closedForGood} jamais ouverts écartés)`);
console.log(`${files} fichiers et ${split.length} carrés découpés dans ${OUT_DIR}/`);
