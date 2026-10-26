/**
 * Après `vite build` : pages confidentialité et support dans chaque langue (dist/<lang>/privacy.html,
 * dist/<lang>/support.html → /fr/privacy, /en/support…). Les pages /privacy et /support à la racine
 * (public/, toutes les langues à la suite) restent pour App Store Connect.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const DIST = "dist";
const ISSUES = "https://github.com/jphilippelingrand/g_faim/issues";
const issuesLink = `<a href="${ISSUES}">github.com/jphilippelingrand/g_faim/issues</a>`;

const PAGES = {
  fr: {
    appName: "Groubl",
    back: "Retour à l'app",
    privacy: {
      title: "Politique de confidentialité",
      updated: "Groubl (app iOS et groubl.com) · mise à jour le 25 octobre 2026",
      body: `
  <h2>En bref</h2>
  <p>Groubl n'a pas de compte utilisateur, ne stocke aucune donnée personnelle et ne fait aucun suivi publicitaire ni statistique.</p>
  <h2>Ta position</h2>
  <p>Avec ton accord, l'app lit ta position au moment où tu l'utilises, pour chercher les restaurants autour de toi. Cette position est envoyée à Google (Google Maps Platform) pour faire la recherche et afficher la carte. Elle n'est ni enregistrée ni transmise ailleurs par Groubl. Si tu refuses l'accès à la position, tu peux taper une adresse à la place ; sur iOS, elle est convertie en coordonnées par le service de géocodage d'Apple.</p>
  <h2>Services tiers</h2>
  <ul>
    <li><strong>Google Maps Platform</strong> (carte, recherche de restaurants) — <a href="https://policies.google.com/privacy">politique de confidentialité de Google</a>.</li>
    <li><strong>Apple</strong> (géocodage d'adresse sur iOS) — <a href="https://www.apple.com/legal/privacy/">politique de confidentialité d'Apple</a>.</li>
    <li><strong>Vercel</strong> (hébergement du site) peut conserver des journaux techniques (adresse IP, navigateur) — <a href="https://vercel.com/legal/privacy-policy">politique de Vercel</a>.</li>
    <li><strong>OpenStreetMap</strong> : les catégories de cuisine sont calculées à l'avance à partir de ses données ; ta position ne lui est pas envoyée.</li>
  </ul>
  <h2>Contact</h2>
  <p>Une question ? Ouvre un ticket sur ${issuesLink}.</p>`,
    },
    support: {
      title: "Support",
      updated: "Groubl — les 5 meilleurs restos ouverts, juste à côté.",
      body: `
  <h2>Un souci, une idée ?</h2>
  <p>Ouvre un ticket sur ${issuesLink}.</p>
  <h2>Questions fréquentes</h2>
  <p><strong>L'app ne trouve pas ma position.</strong> Vérifie dans Réglages → Confidentialité → Service de localisation → Groubl que l'accès est autorisé « Lorsque l'app est active ». Sinon, tape ton adresse.</p>
  <p><strong>Il manque un resto.</strong> L'app n'affiche que les restaurants ouverts en ce moment, avec au moins 10 avis Google. Dézoome la carte pour chercher plus loin.</p>`,
    },
  },
  en: {
    appName: "Groubl",
    back: "Back to the app",
    privacy: {
      title: "Privacy Policy",
      updated: "Groubl (iOS app and groubl.com) · last updated October 25, 2026",
      body: `
  <h2>In short</h2>
  <p>Groubl has no user accounts, stores no personal data, and does no advertising or analytics tracking.</p>
  <h2>Your location</h2>
  <p>With your permission, the app reads your location while you use it to find nearby restaurants. It is sent to Google (Google Maps Platform) to run the search and display the map. Groubl does not store it or share it with anyone else. If you decline, you can type an address instead; on iOS it is geocoded by Apple.</p>
  <h2>Third parties</h2>
  <ul>
    <li><strong>Google Maps Platform</strong> (map, restaurant search) — <a href="https://policies.google.com/privacy">Google privacy policy</a>.</li>
    <li><strong>Apple</strong> (address geocoding on iOS) — <a href="https://www.apple.com/legal/privacy/">Apple privacy policy</a>.</li>
    <li><strong>Vercel</strong> (website hosting) may keep technical logs (IP address, browser) — <a href="https://vercel.com/legal/privacy-policy">Vercel privacy policy</a>.</li>
    <li><strong>OpenStreetMap</strong>: cuisine categories are precomputed from its data; your location is not sent to it.</li>
  </ul>
  <h2>Contact</h2>
  <p>Questions? Open an issue at ${issuesLink}.</p>`,
    },
    support: {
      title: "Support",
      updated: "Groubl — the 5 best open restaurants, right around the corner.",
      body: `
  <h2>A problem or an idea?</h2>
  <p>Open an issue at ${issuesLink}.</p>
  <h2>FAQ</h2>
  <p><strong>The app can't find my location.</strong> In Settings → Privacy → Location Services → Groubl, allow access "While Using the App". Otherwise, type your address.</p>
  <p><strong>A restaurant is missing.</strong> The app only lists restaurants open right now with at least 10 Google reviews. Zoom out the map to search further.</p>`,
    },
  },
  es: {
    appName: "Groubl",
    back: "Volver a la app",
    privacy: {
      title: "Política de privacidad",
      updated: "Groubl (app iOS y groubl.com) · actualizada el 25 de octubre de 2026",
      body: `
  <h2>En resumen</h2>
  <p>Groubl no tiene cuentas de usuario, no guarda ningún dato personal y no hace seguimiento publicitario ni estadístico.</p>
  <h2>Tu ubicación</h2>
  <p>Con tu permiso, la app lee tu ubicación mientras la usas para buscar restaurantes cercanos. Se envía a Google (Google Maps Platform) para hacer la búsqueda y mostrar el mapa. Groubl no la guarda ni la comparte con nadie más. Si no das permiso, puedes escribir una dirección; en iOS, Apple la convierte en coordenadas.</p>
  <h2>Terceros</h2>
  <ul>
    <li><strong>Google Maps Platform</strong> (mapa, búsqueda de restaurantes, fotos) — <a href="https://policies.google.com/privacy">política de privacidad de Google</a>.</li>
    <li><strong>Apple</strong> (geocodificación de direcciones en iOS) — <a href="https://www.apple.com/legal/privacy/">política de privacidad de Apple</a>.</li>
    <li><strong>Vercel</strong> (alojamiento del sitio) puede guardar registros técnicos (dirección IP, navegador) — <a href="https://vercel.com/legal/privacy-policy">política de Vercel</a>.</li>
    <li><strong>OpenStreetMap</strong>: las categorías de cocina se calculan de antemano a partir de sus datos; tu ubicación no se le envía.</li>
  </ul>
  <h2>Contacto</h2>
  <p>¿Alguna pregunta? Abre un ticket en ${issuesLink}.</p>`,
    },
    support: {
      title: "Soporte",
      updated: "Groubl — los 5 mejores restaurantes abiertos, a la vuelta de la esquina.",
      body: `
  <h2>¿Un problema o una idea?</h2>
  <p>Abre un ticket en ${issuesLink}.</p>
  <h2>Preguntas frecuentes</h2>
  <p><strong>La app no encuentra mi ubicación.</strong> En Ajustes → Privacidad → Localización → Groubl, permite el acceso «Cuando se use la app». Si no, escribe tu dirección.</p>
  <p><strong>Falta un restaurante.</strong> La app solo muestra restaurantes abiertos ahora mismo con al menos 10 reseñas de Google. Aleja el mapa para buscar más lejos.</p>`,
    },
  },
};

const STYLE = `
    body { margin: 0; background: #fbf6ef; color: #2b211c; font: 16px/1.6 system-ui, sans-serif; }
    main { max-width: 680px; margin: 0 auto; padding: 24px 16px 64px; }
    nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; font-size: .9rem; }
    nav .langs a { margin-left: 10px; color: #8a7b70; text-decoration: none; }
    nav .langs a[aria-current="page"] { color: #2b211c; font-weight: 600; }
    h1 { font-family: Georgia, serif; font-size: 2rem; margin: 0 0 4px; }
    h2 { font-family: Georgia, serif; font-size: 1.25rem; margin: 32px 0 8px; }
    .muted { color: #8a7b70; }
    a { color: #e2583e; }`;

function render(lang, kind) {
  const page = PAGES[lang];
  const content = page[kind];
  const langs = Object.keys(PAGES)
    .map((l) => `<a href="/${l}/${kind}" hreflang="${l}"${l === lang ? ' aria-current="page"' : ""}>${l.toUpperCase()}</a>`)
    .join("");
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${content.title} · ${page.appName}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
${Object.keys(PAGES).map((l) => `  <link rel="alternate" hreflang="${l}" href="https://www.groubl.com/${l}/${kind}">`).join("\n")}
  <style>${STYLE}
  </style>
</head>
<body>
<main>
  <nav><a href="/${lang}">← ${page.back}</a><span class="langs">${langs}</span></nav>
  <h1>${content.title}</h1>
  <p class="muted">${content.updated}</p>${content.body}
</main>
</body>
</html>
`;
}

for (const lang of Object.keys(PAGES)) {
  mkdirSync(`${DIST}/${lang}`, { recursive: true });
  for (const kind of ["privacy", "support"]) writeFileSync(`${DIST}/${lang}/${kind}.html`, render(lang, kind));
}
console.log(`Pages légales : ${Object.keys(PAGES).map((l) => `/${l}/privacy, /${l}/support`).join(", ")}`);
