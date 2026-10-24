# J'ai faim

Prototype React + Vite : à l'ouverture, l'app prend ta position et affiche sur une carte Google les 5 restaurants les mieux notés autour de toi.

## Setup

1. Dans Google Cloud, active **Maps JavaScript API**, **Places API (New)** et **Geocoding API**, puis crée une clé (restreinte par référent HTTP, ex. `http://localhost:5173/*`).
2. `cp .env.example .env` et colle la clé.
3. `npm install && npm run dev`, puis ouvre http://localhost:5173

## Comment ça cherche

- **Au démarrage** : recherche à 200 m, et on double le rayon (400, 800, 1600 m…) tant qu'on n'a pas 5 restos classables. La carte se cadre ensuite sur toi + les 5.
- **Quand tu dézoomes** (ou déplaces la carte) au-delà de la zone déjà fouillée (cercle rouge), on relance une recherche sur le plus grand cercle visible. Zoomer ne relance rien.
- **Classement** : `Place.searchNearby` ne trie pas par note et renvoie au plus 20 lieux (les plus populaires du cercle). On écarte ceux qui ont moins de 10 avis, puis on trie par note puis nombre d'avis.

Si la géolocalisation est refusée, un champ adresse apparaît (géocodé via Google).
