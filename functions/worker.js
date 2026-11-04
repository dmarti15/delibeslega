// Punto de entrada para Cloudflare Workers (con ficheros estáticos).
// /api/ranking lo responde la API; el resto lo sirven los ficheros de public/.
import { onRequest } from "./api/ranking.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ranking") return onRequest({ request, env, ctx });
    return env.ASSETS.fetch(request);
  },
};