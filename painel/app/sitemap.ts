import type { MetadataRoute } from "next";

import { expandir } from "../lib/dados";
import { slugUf } from "../lib/estado";
import { slugDe } from "../lib/fiscal";
import { lerSnapshot, SITE } from "../lib/servidor";

// Com `output: "export"`, sitemap e robots sao route handlers e o Next exige
// que sejam declarados estaticos -- sem isto o build morre com
// `export const dynamic = "force-static" not configured on route`. Nao e
// opcional aqui: nao existe servidor para gerar isto sob demanda.
export const dynamic = "force-static";


/**
 * O sitemap, gerado no build a partir do próprio snapshot.
 *
 * Sem ele, 1.794 páginas que ninguém linka de fora podem levar meses para
 * serem descobertas — o rastreador precisa de um caminho até elas, e listar
 * à mão um arquivo que muda a cada coleta seria garantia de ficar desatualizado.
 *
 * A convenção de arquivo do App Router publica isto em `/sitemap.xml`:
 * https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await lerSnapshot();
  const atualizado = new Date(snapshot.geradoEm);

  const inicio: MetadataRoute.Sitemap = [
    {
      url: `${SITE}/`,
      lastModified: atualizado,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  // Prioridade acima da do municipio: sao 9 paginas que concentram o link
  // interno de 1.794. No grafo do site elas sao o unico caminho da home ate a
  // maioria das paginas -- ver `lib/estado.ts`.
  const estados: MetadataRoute.Sitemap = snapshot.ufs.map((u) => ({
    url: `${SITE}/estado/${slugUf(u.sigla)}/`,
    lastModified: atualizado,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  const municipios: MetadataRoute.Sitemap = expandir(snapshot).map((m) => ({
    url: `${SITE}/municipio/${slugDe(m.nome, m.uf)}/`,
    lastModified: atualizado,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...inicio, ...estados, ...municipios];
}
