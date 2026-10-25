# J'ai faim

Prototype React + Vite : à l'ouverture, l'app prend ta position et affiche sur une carte Google les 5 restaurants les mieux notés autour de toi.

## Setup

1. Dans Google Cloud, active **Maps JavaScript API**, **Places API (New)** et **Geocoding API**, puis crée une clé (restreinte par référent HTTP, ex. `http://localhost:5173/*`).
2. `cp .env.example .env` et colle la clé.
3. `npm install && npm run dev`, puis ouvre http://localhost:5173

## Comment ça cherche

- **Au démarrage** : recherche à 200 m, et on double le rayon (400, 800, 1600 m…) tant qu'on n'a pas 5 restos classables. La carte se cadre ensuite sur toi + les 5.
- **Quand tu dézoomes** (ou déplaces la carte) au-delà de la zone déjà fouillée (cercle rouge), on relance une recherche sur le plus grand cercle visible. Pareil quand tu zoomes assez pour que la vue fasse moins de 60 % de la zone fouillée.
- **Classement** : `Place.searchNearby` ne trie pas par note et renvoie au plus 20 lieux (les plus populaires du cercle). On écarte ceux qui ont moins de 10 avis, puis on trie par note puis nombre d'avis.

Si la géolocalisation est refusée, un champ adresse apparaît (géocodé via Google).

## Sur iPhone (PWA)

Ouvre le site dans **Safari** → bouton Partager → **Sur l'écran d'accueil**. L'app s'ouvre ensuite en plein écran avec son icône.

Les icônes sont générées depuis `public/icon.svg` (192, 512 et 180 px pour iOS).

## App iOS (Expo) — dossier `app/`

App native React Native (Expo SDK 58), même logique que la web app : carte Google (`react-native-maps`), Places API (New) en REST, la petite dame en SVG animé, vibrations.

- **Clé Google dédiée** : restreinte à l'app iOS `com.jphilippelingrand.gfaim`, APIs **Maps SDK for iOS** + **Places API (New)**. À mettre dans `app/.env` (voir `app/.env.example`) et dans les variables d'environnement EAS.
- **Tester vite** : `cd app && npx expo start`, puis scanner le QR code avec Expo Go. Dans Expo Go la carte est Apple Maps (Google Maps n'y est pas embarqué) ; les vrais builds utilisent Google Maps.
- **Builds / App Store** : `npx eas-cli@latest build -p ios --profile development|production`, puis `npx eas-cli@latest submit -p ios`. Pas besoin d'Xcode : tout se compile chez EAS.
- **Release automatique** (`app/.eas/workflows/release-ios.yml`) : `git tag v1.0.1 && git push origin v1.0.1` lance chez EAS le build de production (version lue dans le tag) puis l'envoi sur App Store Connect / TestFlight. Prérequis : repo GitHub relié au projet EAS avec `app` comme base directory, et un premier `build` + `submit` lancés en local (certificats et clé App Store Connect stockés chez EAS).
