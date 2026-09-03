import type { MetadataRoute } from "next";

import { SITE } from "../lib/servidor";

// Com `output: "export"`, sitemap e robots sao route handlers e o Next exige
// que sejam declarados estaticos -- sem isto o build morre com
// `export const dynamic = "force-static" not configured on route`. Nao e
// opcional aqui: nao existe servidor para gerar isto sob demanda.
export const dynamic = "force-static";


/**
 * `robots.txt`, publicado pela convenção de arquivo do App Router.
 *
 * Antes disto o site respondia **404** em `/robots.txt` e em `/sitemap.xml` —
 * medido em 03/09/2026. Não é fatal, mas é o primeiro lugar onde um rastreador
 * olha, e um 404 ali não dá nenhuma pista de que existem 1.794 páginas.
 *
 * Tudo é liberado de propósito: é dado público, republicado sob AGPL-3.0, e
 * não há nada aqui que não deva ser indexado.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
