import { lerSnapshot } from "@/lib/servidor";

/**
 * O índice de busca do site: nome, UF e slug de cada município.
 *
 * ## Por que um arquivo, e não o índice embutido em cada página
 *
 * A busca do cabeçalho existe em **todas** as 5.600 páginas. Embutir o índice
 * no HTML custaria **30 KB comprimidos por página** — medido em 04/09/2026 —
 * e dobraria o peso das páginas menores para uma funcionalidade que a maioria
 * das visitas nunca aciona. Quem chega de uma busca externa abre uma página e
 * sai; a busca interna é para quem fica.
 *
 * Aqui o índice é um arquivo estático, buscado **no primeiro foco do campo**.
 * Custa zero para quem não busca, uma vez só para quem busca, e o CDN o entrega
 * como qualquer outro arquivo — sem servidor, coerente com `output: "export"`.
 *
 * ## Por que este formato
 *
 * **Dois campos por município, em array de arrays** e não objeto: as chaves
 * `nome`/`uf` repetidas 5.571 vezes custariam mais que os dados. É a mesma
 * lição do payload da capa, que caiu 57% ao parar de repetir chave.
 *
 * **O slug NÃO vai gravado.** A primeira versão o gravava, com o argumento de
 * que derivá-lo no navegador exigiria reproduzir a regra do build e uma
 * divergência quebraria links em silêncio. O argumento estava errado: o
 * navegador importa a **mesma** `slugDe`, então não há regra a reproduzir nem
 * divergência possível. Gravá-lo custava o dobro do arquivo — medido:
 * **78 KB comprimidos contra 30 KB** — por uma segurança imaginária.
 */
export const dynamic = "force-static";

export async function GET() {
  const snapshot = await lerSnapshot();
  // ORDENADO POR POPULAÇÃO, decrescente — e é isto que faz a busca servir.
  //
  // Achado dirigindo o campo em 04/09/2026: com a ordem do snapshot (código do
  // IBGE), digitar "sao" devolvia **oito municípios de Alagoas** e São Paulo
  // não aparecia. Do ponto de vista de quem busca, a ordem por código é
  // aleatória — e a busca corta nos 8 primeiros.
  //
  // Quem digita "sao" quer São Paulo, São Luís, São Gonçalo. Ordenar aqui, uma
  // vez, no build, custa **zero byte** e dispensa carregar a população para o
  // navegador só para ordenar lá. A ordem do arquivo É a ordem de relevância.
  const iPop = snapshot.colunas.indexOf("populacao-censo-2022");
  const iEst = snapshot.colunas.indexOf("populacao-estimada");
  const indice = [...snapshot.municipios]
    .sort((a, b) => {
      // Sem população conhecida vai para o fim: ausência não é município
      // pequeno. Empate desfeito pelo nome, para a ordem ser determinística —
      // senão dois builds do mesmo dado gerariam arquivos diferentes.
      const pa = (a[iPop] as number | null) ?? (a[iEst] as number | null) ?? -1;
      const pb = (b[iPop] as number | null) ?? (b[iEst] as number | null) ?? -1;
      if (pa !== pb) return pb - pa;
      return String(a[1]).localeCompare(String(b[1]), "pt-BR");
    })
    .map(([, nome, uf]) => [nome, uf]);

  return new Response(JSON.stringify(indice), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Imutável dentro de um deploy: o conteúdo só muda quando o build muda,
      // e cada build publica o arquivo de novo.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
