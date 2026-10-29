# Groubl

Site React + Vite : à l'ouverture, il prend ta position et affiche sur une carte les 5 restos ouverts les plus proches. Aucune API payante : les restos viennent d'OpenStreetMap, la carte d'OpenFreeMap.

## Setup

`npm install && npm run dev`, puis ouvre http://localhost:5173. Pas de clé à configurer.

## Les données

- **Restos** : `node tools/build-places.ts` découpe les restos d'OpenStreetMap (nom, position, horaires, cuisine) en fichiers par zone dans `public/places/` (carrés de 1°, découpés en 0,25° puis 0,05° là où c'est dense ; liste des carrés découpés dans `public/places/index.json`). Il lit les extraits `data/osm/<pays>-restos.geojsonseq` produits par `tools/build-cuisines.ts` (osmium + extraits Geofabrik) : relancer les deux pour rafraîchir.
- **Horaires** : lus au moment du calcul (bibliothèque `opening_hours`) et stockés en minutes depuis lundi 00:00 ; le site compare avec l'heure de l'appareil.
- **Horaires des enseignes** : là où OSM n'en a pas, `tools/alltheplaces.ts` les prend dans [All The Places](https://alltheplaces.xyz) (horaires publiés par les chaînes sur leurs sites, collectés chaque semaine, CC0) : même enseigne (Wikidata) à moins de 150 m ou même nom à moins de 100 m ; les restos d'enseignes absents d'OSM sont ajoutés. Les horaires OSM ne sont jamais remplacés. Chaque lancement de `build-places.ts` vérifie s'il y a une nouvelle publication hebdomadaire (téléchargement ~3 Go, ~2 min) ; les collectes ratées cette semaine-là sont reprises d'une des 4 précédentes.
- **Rafraîchir** : All The Places, chaque semaine : `node tools/build-places.ts`. OSM (Geofabrik se met à jour chaque jour ; une fois par mois suffit) : retélécharger `data/osm/<pays>.osm.pbf` depuis download.geofabrik.de, `rm data/osm/*-restos.geojsonseq && node tools/build-cuisines.ts`, puis `node tools/build-places.ts`.
- **Cuisines** : `public/cuisines/` sert encore à l'app iOS (catégories par quartier) ; le site ne s'en sert plus.

## Comment ça cherche

- On charge les fichiers autour de toi et on garde les restos **ouverts pour encore au moins 20 minutes**, du plus proche au plus loin : rayon de 500 m, puis 1, 2, 4… jusqu'à 32 km, jusqu'à en avoir 5.
- À partir de 2 km, plutôt que d'aller plus loin, on complète avec les plus proches **aux horaires inconnus** (affichés comme tels) : environ un resto OSM sur trois seulement a des horaires.
- Le bouton d'itinéraire ouvre Google Maps par simple lien (gratuit, sans API).

Si la géolocalisation est refusée, un champ adresse apparaît (géocodé par Nominatim, OpenStreetMap).

## Sur iPhone (PWA)

Ouvre le site dans **Safari** → bouton Partager → **Sur l'écran d'accueil**. L'app s'ouvre ensuite en plein écran avec son icône.

Les icônes sont générées depuis `public/icon.svg` (192, 512 et 180 px pour iOS).

## App iOS (Expo) — dossier `app/`

App native React Native (Expo SDK 58), même logique que la web app : les 5 restos ouverts les plus proches, lus dans les fichiers `places/` de groubl.com (rien à mettre à jour dans l'app quand on les recalcule), carte Plans d'Apple (`react-native-maps`, sans clé), la petite dame en SVG animé, vibrations.

- **Aucune clé** : plus de Google dans l'app. La variable `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (`app/.env`, EAS) peut être supprimée, et la clé désactivée dans Google Cloud une fois l'ancienne version retirée de l'App Store.
- **Tester vite** : `cd app && npx expo start`, puis scanner le QR code avec Expo Go.
- **Builds / App Store** : `npx eas-cli@latest build -p ios --profile development|production`, puis `npx eas-cli@latest submit -p ios`. Pas besoin d'Xcode : tout se compile chez EAS.
- **Release automatique** (`app/.eas/workflows/release-ios.yml`) : `git tag v1.0.1 && git push origin v1.0.1` lance chez EAS le build de production (version lue dans le tag) puis l'envoi sur App Store Connect / TestFlight. Prérequis : repo GitHub relié au projet EAS avec `app` comme base directory, et un premier `build` + `submit` lancés en local (certificats et clé App Store Connect stockés chez EAS).
