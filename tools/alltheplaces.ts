/**
 * Restos de All The Places (https://alltheplaces.xyz) : les adresses et horaires publiés par les
 * enseignes sur leurs propres sites, collectés chaque semaine. Données sous CC0 : on peut les
 * mélanger aux données OSM (ODbL) et les redistribuer.
 *
 * La dernière publication est téléchargée une fois (~3 Go) dans data/atp/<publication>/, puis on n'en
 * garde que les restos et fast-foods avec des horaires, dans data/atp/<publication>-restos.geojsonseq.
 * Les collectes ratées cette semaine-là (une enseigne qui tombe à presque rien) sont reprises d'une des
 * publications précédentes.
 */
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, type WriteStream } from "node:fs";

const ATP_DIR = "data/atp";
const HISTORY = "https://data.alltheplaces.xyz/runs/history.json";
const FILES = "https://alltheplaces-data.openaddresses.io/runs";
// Une collecte est ratée si elle rend moins de la moitié de son meilleur résultat sur les dernières semaines.
const PREVIOUS_RUNS = 4;
const BROKEN_RATIO = 0.5;
const MIN_FEATURES = 20;

type Run = { run_id: string; output_url: string };
type SpiderStats = { results: { spider: string; features: number }[] };

/** Garde les restos et fast-foods avec horaires ; renvoie leur nombre. Une entité par ligne dans chaque fichier. */
async function filterRestaurants(input: AsyncIterable<string>, sink: WriteStream): Promise<number> {
  let rest = "";
  let kept = 0;
  const keep = (line: string) => {
    // Tri grossier avant de décoder : la plupart des lignes sont des magasins.
    if (!line.includes('"opening_hours"') || !/"amenity": "(restaurant|fast_food)"/.test(line)) return;
    const json = line.trim().replace(/,$/, "");
    if (!json.startsWith('{"type": "Feature"')) return;
    sink.write(json + "\n");
    kept++;
  };
  for await (const chunk of input) {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop()!;
    lines.forEach(keep);
  }
  keep(rest);
  return kept;
}

/** Les ~16 premiers Ko d'un fichier (le serveur ignore les requêtes partielles : on coupe le flux). */
async function head(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) return "";
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  while (text.length < 16_384) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
  }
  await reader.cancel();
  return text;
}

const stats = async (run: string): Promise<SpiderStats> => (await fetch(`${FILES}/${run}/stats/_results.json`)).json();

/** Collectes de restos ratées dans `latest`, avec la publication récente où elles ont le mieux marché. */
async function brokenSpiders(latest: string, previous: string[]): Promise<{ spider: string; run: string }[]> {
  const now = new Map((await stats(latest)).results.map((r) => [r.spider, r.features]));
  const best = new Map<string, { features: number; run: string }>();
  for (const run of previous) {
    for (const { spider, features } of (await stats(run)).results) {
      if (features > (best.get(spider)?.features ?? 0)) best.set(spider, { features, run });
    }
  }
  const broken = [...best].filter(([spider, b]) => b.features >= MIN_FEATURES && (now.get(spider) ?? 0) < b.features * BROKEN_RATIO);
  // On ne télécharge en entier que les enseignes de restauration : le début du fichier suffit à le savoir.
  const food: { spider: string; run: string }[] = [];
  for (const [spider, { run }] of broken) {
    if (/"amenity": "(restaurant|fast_food)"/.test(await head(`${FILES}/${run}/output/${spider}.geojson`))) food.push({ spider, run });
  }
  return food;
}

/** Le fichier des restos de la dernière publication, téléchargé et filtré si besoin. */
export async function atpRestaurants(): Promise<{ file: string; run: string }> {
  const history = (await (await fetch(HISTORY)).json()) as Run[];
  const { run_id: run, output_url: url } = history[history.length - 1];
  const out = `${ATP_DIR}/${run}-restos.geojsonseq`;
  if (existsSync(out)) return { file: out, run };

  const zip = `${ATP_DIR}/${run}/output.zip`;
  if (!existsSync(zip)) {
    mkdirSync(`${ATP_DIR}/${run}`, { recursive: true });
    console.log(`  All The Places : téléchargement de la publication ${run} (~3 Go)…`);
    execFileSync("curl", ["-fsSL", "--retry", "3", "-o", `${zip}.part`, url], { stdio: "inherit" });
    renameSync(`${zip}.part`, zip);
  }

  console.log("  All The Places : tri des restos…");
  const sink = createWriteStream(`${out}.part`);
  // On lit l'archive en flux, sans la décompresser sur disque.
  let kept = await filterRestaurants(spawn("unzip", ["-p", zip]).stdout.setEncoding("utf8"), sink);

  const previous = history.slice(-1 - PREVIOUS_RUNS, -1).map((r) => r.run_id);
  const broken = await brokenSpiders(run, previous);
  for (const { spider, run: from } of broken) {
    const res = await fetch(`${FILES}/${from}/output/${spider}.geojson`);
    if (!res.ok || !res.body) continue;
    const n = await filterRestaurants(res.body.pipeThrough(new TextDecoderStream()), sink);
    console.log(`  All The Places : ${spider} repris de ${from} (${n} restos)`);
    kept += n;
  }

  await new Promise((resolve) => sink.end(resolve));
  renameSync(`${out}.part`, out);
  // L'archive ne sert plus : la prochaine publication la remplacera.
  rmSync(`${ATP_DIR}/${run}`, { recursive: true, force: true });
  console.log(`  All The Places : ${kept} restos avec horaires`);
  return { file: out, run };
}
