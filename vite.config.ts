import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * En local (npm run dev), ce que vercel.json fait en ligne : /v/<id> sert la page de vote, et /api/polls
 * (ou /api/polls/<id>) appelle la fonction api/polls.ts. Sans Redis configuré, les sondages vivent en mémoire.
 */
function pollsDev(): Plugin {
  return {
    name: "polls-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        if (/^\/v\/[A-Za-z0-9]+$/.test(url.pathname)) {
          req.url = "/vote.html";
          return next();
        }
        const api = url.pathname.match(/^\/api\/polls(?:\/([A-Za-z0-9]+))?$/);
        if (!api) return next();
        if (api[1]) url.searchParams.set("id", api[1]);
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const handlers = await server.ssrLoadModule("/api/polls.ts");
        const handler = handlers[req.method ?? "GET"];
        if (!handler) {
          res.statusCode = 405;
          return res.end();
        }
        const response: Response = await handler(
          new Request(url, { method: req.method, headers: req.headers as HeadersInit, body: chunks.length ? Buffer.concat(chunks) : undefined }),
        );
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text());
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), pollsDev()],
  // Le site compile aussi app/src/lib/pollsApi.ts (partagé avec l'app) : sans ça, Vite irait lire
  // app/tsconfig.json, qui hérite d'Expo, absent sur Vercel (seules les dépendances du site y sont installées).
  // Mêmes options utiles que tsconfig.json.
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: "ES2022", jsx: "react-jsx" } }) },
  build: {
    rollupOptions: {
      // Le site, et la page de vote (groubl.com/v/<id>, réécrite vers vote.html par vercel.json).
      input: { main: "index.html", vote: "vote.html" },
    },
  },
});
