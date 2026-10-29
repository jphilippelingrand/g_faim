/**
 * Découpage des restos d'OpenStreetMap en fichiers, partagé entre leur calcul (tools/build-places.ts)
 * et le site, pour que les noms de fichiers soient identiques des deux côtés.
 *
 * Carrés de 1°, découpés en 0,25° (~25 km) là où il y a trop de restos, puis en 0,05° (~5 km) dans les
 * villes. Un fichier par carré non découpé : public/places/<niveau>/<coin sud-ouest>.json. La liste des
 * carrés découpés est dans public/places/index.json.
 */

/** Taille des carrés à chaque niveau, en degrés. */
export const LEVELS = [1, 0.25, 0.05] as const;
const DECIMALS = [0, 2, 2];

/** Au-delà, un carré est découpé au niveau suivant (sauf au dernier). */
export const MAX_PER_FILE = 1500;

/**
 * Un resto : [nom, lat, lng, horaires, cuisine OSM, source des horaires].
 * Horaires : intervalles d'ouverture à l'heure locale, en minutes depuis lundi 00:00, à plat
 * ([début, fin, début, fin…], au plus 7 × 24 × 60) ; 0 quand on ne les connaît pas (ou qu'on ne sait pas les lire).
 * Cuisine : "" si inconnue mais qu'une source suit. Source : absente = OpenStreetMap, sinon HOURS_SOURCE.
 */
export type PlaceRow = [name: string, lat: number, lng: number, hours: number[] | 0, cuisine?: string, source?: number];

/** D'où viennent les horaires, quand ce n'est pas d'OpenStreetMap. */
export const HOURS_SOURCE = {
  /** Site de l'enseigne, via All The Places. */
  chain: 1,
  /** Une autre base ouverte (Overture, etc.). */
  other: 2,
} as const;

/** Carrés découpés, sous la forme "<niveau>:<clé>" (ex. "0:45_-74", "1:45.50_-73.75"). */
export type PlacesIndex = { version: string; split: string[] };

export const WEEK_MINUTES = 7 * 24 * 60;

/** Nom du carré qui contient ce point au niveau donné : son coin sud-ouest, ex. "45.50_-73.75". */
export function cellKey(lat: number, lng: number, level: number): string {
  const size = LEVELS[level];
  // Le epsilon évite qu'un 45.5 stocké en 45.4999999 tombe dans la mauvaise case.
  const corner = (v: number) => (Math.floor(v / size + 1e-9) * size).toFixed(DECIMALS[level]);
  return `${corner(lat)}_${corner(lng)}`;
}

/** Le fichier qui contient ce point : le carré le plus fin disponible. */
export function leafFor(split: Set<string>, lat: number, lng: number): { level: number; key: string } {
  let level = 0;
  while (level < LEVELS.length - 1 && split.has(`${level}:${cellKey(lat, lng, level)}`)) level++;
  return { level, key: cellKey(lat, lng, level) };
}
