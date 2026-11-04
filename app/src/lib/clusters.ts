import type { Region } from "react-native-maps";
import type { LatLng, Restaurant } from "./places";

/** Un groupe de restos trop proches à l'écran pour être montrés un par un : un rond avec leur nombre. */
export type Cluster = { key: string; location: LatLng; members: Restaurant[]; open: boolean };

// Deux restos (ou groupes) à moins de ça à l'écran (en points, au moins) vont dans le même groupe : un peu plus que le
// plus gros rond, pour qu'ils ne se chevauchent pas.
const CELL_PX = 48;

/**
 * Regroupe les restos à moins de CELL_PX l'un de l'autre à l'écran : chaque resto rejoint le premier groupe assez
 * proche (sinon il en commence un), puis les groupes qui se touchent encore fusionnent (sinon leurs ronds se
 * chevauchent). Le rayon suit le zoom, arrondi à la puissance de 2 au-dessus (entre 1 et 2 fois CELL_PX) : les groupes ne changent qu'à un vrai
 * changement de zoom, pas au moindre glissement. Un resto seul reste un resto ; les autres deviennent un groupe.
 */
export function clusterize(places: Restaurant[], region: Region | null, widthPx: number): { singles: Restaurant[]; clusters: Cluster[] } {
  if (!region || widthPx <= 0 || places.length < 2) return { singles: places, clusters: [] };
  const radius = 2 ** Math.ceil(Math.log2((region.longitudeDelta * CELL_PX) / widthPx));
  // Mercator : à cette latitude, un degré de latitude prend plus de place à l'écran qu'un degré de longitude.
  const latScale = 1 / Math.cos((region.latitude * Math.PI) / 180);

  type Group = { lat: number; lng: number; members: Restaurant[] };
  const near = (a: Group, lat: number, lng: number) => Math.hypot((a.lat - lat) * latScale, a.lng - lng) < radius;
  const groups: Group[] = [];
  for (const r of places) {
    const { latitude: lat, longitude: lng } = r.location;
    const g = groups.find((g) => near(g, lat, lng));
    if (!g) {
      groups.push({ lat, lng, members: [r] });
      continue;
    }
    g.members.push(r);
    g.lat += (lat - g.lat) / g.members.length;
    g.lng += (lng - g.lng) / g.members.length;
  }
  // Fusionner deux groupes déplace leur centre : on repasse tant qu'il y a eu une fusion.
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const [a, b] = [groups[i], groups[j]];
        if (!near(a, b.lat, b.lng)) continue;
        const n = a.members.length + b.members.length;
        a.lat = (a.lat * a.members.length + b.lat * b.members.length) / n;
        a.lng = (a.lng * a.members.length + b.lng * b.members.length) / n;
        a.members.push(...b.members);
        groups.splice(j--, 1);
        merged = true;
      }
    }
  }

  const singles: Restaurant[] = [];
  const clusters: Cluster[] = [];
  for (const g of groups) {
    if (g.members.length === 1) singles.push(g.members[0]);
    else
      clusters.push({
        key: `${radius}:${g.members[0].id}`,
        location: { latitude: g.lat, longitude: g.lng },
        members: g.members,
        open: g.members.some((r) => r.open === true),
      });
  }
  return { singles, clusters };
}

/** La région qui montre tous les restos d'un groupe (on y va quand on le touche). */
export function regionOf(members: Restaurant[]): Region {
  const lats = members.map((r) => r.location.latitude);
  const lngs = members.map((r) => r.location.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 2.2, 0.002),
    longitudeDelta: Math.max((maxLng - minLng) * 2.2, 0.002),
  };
}
