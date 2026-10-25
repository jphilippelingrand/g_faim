/**
 * COPIE de src/lib/cuisineGrid.ts (site) : Metro n'importe pas hors de app/. Garder les deux identiques.
 *
 * Découpage du monde en carrés de latitude/longitude, partagé entre le calcul des fichiers
 * (tools/build-cuisines.ts) et le site, pour que les noms de zones soient identiques des deux côtés.
 *
 * Un fichier par carré de 10° (public/cuisines/<lat>_<lng>.json, coin sud-ouest), qui contient ses
 * sous-zones de 0,5° (~50 km), elles-mêmes éventuellement découpées en 0,05° (~5 km) là où on a
 * choisi d'affiner. Chaque zone porte ses propres catégories ; une zone sans sous-zone suffit.
 */

/** Taille des carrés à chaque niveau, en degrés. */
export const LEVELS = [10, 0.5, 0.05] as const;
const DECIMALS = [0, 1, 2];

/** [cuisine OSM, 1 si spécialité du coin] */
export type CategoryEntry = [key: string, distinctive?: 1];

export type CuisineNode = {
  /** Nombre de restos (avec une cuisine renseignée) dans la zone. */
  count: number;
  categories: CategoryEntry[];
  sub_regions?: Record<string, CuisineNode>;
};

/** Nom de la zone qui contient ce point au niveau donné : son coin sud-ouest, ex. "45.50_-73.60". */
export function cellKey(lat: number, lng: number, level: number): string {
  const size = LEVELS[level];
  // Le epsilon évite qu'un 45.5 stocké en 45.4999999 tombe dans la mauvaise case.
  const corner = (v: number) => (Math.floor(v / size + 1e-9) * size).toFixed(DECIMALS[level]);
  return `${corner(lat)}_${corner(lng)}`;
}

/** Niveau de détail voulu selon le rayon visible : pays, région, quartier. */
export function levelForRadius(radiusMeters: number): number {
  if (radiusMeters >= 50_000) return 0;
  if (radiusMeters >= 3_000) return 1;
  return 2;
}

/**
 * Les zones qui contiennent le point, de la plus grande (le fichier) à la plus fine disponible
 * jusqu'au niveau voulu.
 */
export function findPath(tile: CuisineNode, lat: number, lng: number, level: number): CuisineNode[] {
  const path = [tile];
  for (let l = 1; l <= level; l++) {
    const child = path[path.length - 1].sub_regions?.[cellKey(lat, lng, l)];
    if (!child) break;
    path.push(child);
  }
  return path;
}
