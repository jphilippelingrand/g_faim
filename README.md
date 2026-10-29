# Groubl

Site React + Vite : à l'ouverture, il prend ta position et affiche sur une carte les 5 restos ouverts les plus proches. Aucune API payante : les restos viennent d'OpenStreetMap, la carte d'OpenFreeMap.

## Setup

`npm install && npm run dev`, puis ouvre http://localhost:5173. Pas de clé à configurer.

## Les données

- **Restos** : `node tools/build-places.ts` découpe les restos d'OpenStreetMap (nom, position, horaires, cuisine) en fichiers par zone dans `public/places/` (carrés de 1°, découpés en 0,25° puis 0,05° là où c'est dense ; liste des carrés découpés dans `public/places/index.json`). Il lit les extraits `data/osm/<pays>-restos.geojsonseq` produits par `tools/build-cuisines.ts` (osmium + extraits Geofabrik) : relancer les deux pour rafraîchir.
- **Horaires** : lus au moment du calcul (bibliothèque `opening_hours`) et stockés en minutes depuis lundi 00:00 ; le site compare avec l'heure de l'appareil.
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

App native React Native (Expo SDK 58), même logique que la web app : carte Google (`react-native-maps`), Places API (New) en REST, la petite dame en SVG animé, vibrations.

- **Clé Google dédiée** : restreinte à l'app iOS `com.jphilippelingrand.gfaim`, APIs **Maps SDK for iOS** + **Places API (New)**. À mettre dans `app/.env` (voir `app/.env.example`) et dans les variables d'environnement EAS.
- **Tester vite** : `cd app && npx expo start`, puis scanner le QR code avec Expo Go. Dans Expo Go la carte est Apple Maps (Google Maps n'y est pas embarqué) ; les vrais builds utilisent Google Maps.
- **Builds / App Store** : `npx eas-cli@latest build -p ios --profile development|production`, puis `npx eas-cli@latest submit -p ios`. Pas besoin d'Xcode : tout se compile chez EAS.
- **Release automatique** (`app/.eas/workflows/release-ios.yml`) : `git tag v1.0.1 && git push origin v1.0.1` lance chez EAS le build de production (version lue dans le tag) puis l'envoi sur App Store Connect / TestFlight. Prérequis : repo GitHub relié au projet EAS avec `app` comme base directory, et un premier `build` + `submit` lancés en local (certificats et clé App Store Connect stockés chez EAS).
