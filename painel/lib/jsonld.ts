/**
 * As peças de JSON-LD que descrevem os conjuntos de dados. **Módulo puro.**
 *
 * ## Por que isto merece um módulo, e não uma constante colada em cada página
 *
 * O `schema.org/Dataset` não é enfeite aqui: é o formato que alimenta o
 * **Google Dataset Search**, um índice separado da busca comum, feito para
 * dados de governo e de pesquisa — exatamente o que este site publica. Dos
 * campos recomendados pela documentação do Google, uma auditoria de 03/09/2026
 * encontrou **cinco ausentes e aplicáveis**: `temporalCoverage`,
 * `variableMeasured`, `identifier`, `keywords` e `includedInDataCatalog`.
 *
 * Nenhum deles é obrigatório, e é por isso que passam despercebidos: a página
 * valida sem eles. O que eles decidem é se o conjunto aparece **descrito** num
 * índice de dados ou apenas como mais uma página de texto.
 *
 * ## A cobertura temporal é CALCULADA
 *
 * Escrever "2024" à mão seria repetir o erro que a expansão nacional já cobrou
 * duas vezes hoje: número correto na hora em que foi digitado e falso na coleta
 * seguinte, sem nada acusar.
 */

import type { SnapshotFiscal } from "./fiscal";
import type { SnapshotIdeb } from "./ideb";
import type { Snapshot } from "./dados";

/** O `@id` do catálogo, declarado uma vez na capa e referenciado pelo resto. */
export function idCatalogo(site: string): string {
  return `${site}/#catalogo`;
}

/** O nome do catálogo e do site. Uma constante para não divergirem. */
export const NOME_CATALOGO = "Números Públicos";

/**
 * Referência a um nó declarado em OUTRA página — com identidade própria.
 *
 * ## Por que `@id` sozinho não basta fora da capa
 *
 * O `@id` resolve **dentro do grafo onde o nó está declarado**. Na capa isso é
 * verdade: `DataCatalog`, `WebSite` e `Dataset` moram no mesmo `@graph`. Nas
 * 5.598 páginas de estado e de município, o `includedInDataCatalog` apontava
 * para um nó que **não existe naquela página** — e o Google analisa cada página
 * isoladamente, então via um nó sem `name` e sem `url`.
 *
 * Foi exatamente o que ele reportou em 05/09/2026, no e-mail do Search Console:
 * *"É preciso especificar name ou url (em includedInDataCatalog)"*.
 *
 * ## O que custa e o que compra
 *
 * Repetir `name` e `url` custa ~90 bytes por página e mantém o `@id`, que é o
 * que liga as pontas para quem resolve o grafo entre páginas. Não é duplicação
 * de dado: é uma referência que se explica sozinha, que é o que qualquer
 * consumidor de uma página só precisa.
 *
 * Vale para toda referência entre páginas, não só o catálogo — a página de
 * ajuda tinha o mesmo padrão em `about` e `isPartOf`.
 */
export function referencia(
  id: string, tipo: string, nome: string, url: string,
): { "@id": string; "@type": string; name: string; url: string } {
  return { "@id": id, "@type": tipo, name: nome, url };
}

/** O catálogo, referenciável de qualquer página. */
export function catalogoDe(site: string) {
  return referencia(idCatalogo(site), "DataCatalog", NOME_CATALOGO, `${site}/`);
}

/**
 * O conjunto de dados do site inteiro, referenciável de qualquer página.
 *
 * **Leva `description`, e não por capricho.** Um nó `Dataset` com `name` e sem
 * `description` é "erro crítico" para o Google — mais grave que a referência
 * crua que ele substitui. A auditoria pegou isso no mesmo dia em que a correção
 * foi escrita, reprovando a página de ajuda: dar identidade a uma referência
 * de `Dataset` obriga a completá-la.
 *
 * A descrição é estática e **sem contagem**. A da capa embute "5.571
 * municípios" porque é calculada ali; repeti-la aqui à mão seria o erro que
 * esta base já pagou três vezes — número certo no dia em que foi digitado e
 * falso na coleta seguinte, sem nada acusar.
 */
export function conjuntoDoSite(site: string) {
  return {
    ...referencia(`${site}/#dados`, "Dataset",
                  "Dados abertos dos municípios brasileiros", `${site}/`),
    description:
      "População, PIB, despesa com pessoal, despesa liquidada por função " +
      "orçamentária e IDEB dos municípios brasileiros, a partir das APIs " +
      "públicas do IBGE, do SICONFI/Tesouro Nacional e do INEP.",
  };
}

/** O site, referenciável de qualquer página. */
export function siteDe(site: string) {
  return referencia(`${site}/#site`, "WebSite", NOME_CATALOGO, `${site}/`);
}

/**
 * O intervalo coberto pelos dados, em ISO 8601 (`"2005/2024"`).
 *
 * Sai do próprio dado: a edição mais antiga do IDEB de um lado, o exercício
 * fiscal mais recente do outro. Um período aberto (`"2005/.."`) seria mais
 * bonito e menos verdadeiro — a série tem fim, e ele é conhecido.
 */
export function coberturaTemporal(
  snapshot: Snapshot,
  fiscal: SnapshotFiscal,
  ideb: SnapshotIdeb,
): string {
  const anos: number[] = [fiscal.exercicio];
  if (fiscal.funcoes) anos.push(fiscal.funcoes.exercicio);
  if (fiscal.funcoes?.anterior) anos.push(fiscal.funcoes.anterior.exercicio);
  anos.push(...ideb.edicoes);
  for (const i of snapshot.indicadores) {
    const ano = Number(i.periodo);
    if (Number.isFinite(ano)) anos.push(ano);
  }
  const min = Math.min(...anos);
  const max = Math.max(...anos);
  return min === max ? `${min}` : `${min}/${max}`;
}

/** O que os conjuntos medem, nas palavras que uma pessoa usaria. */
export const VARIAVEIS = [
  "População residente (Censo do IBGE)",
  "Produto Interno Bruto municipal a preços correntes",
  "Despesa com pessoal sobre a receita corrente líquida ajustada",
  "Despesa liquidada por função orçamentária",
  "IDEB da rede municipal",
];

/**
 * O identificador do município, como `PropertyValue`.
 *
 * O Google recomenda DOI ou identificador compacto; nenhum dos dois existe
 * para um município. O código do IBGE é o identificador real, universal no
 * Brasil, e `PropertyValue` com `propertyID` é a forma de dizer **de qual
 * esquema** ele vem — sem isso seria um número solto.
 */
export function identificadorIbge(codigo: number) {
  return {
    "@type": "PropertyValue",
    propertyID: "https://www.ibge.gov.br/",
    name: "Código IBGE do município",
    value: String(codigo),
  };
}

/** Palavras-chave. Poucas e específicas: lista longa dilui em vez de somar. */
export function palavrasChave(extra: string[] = []): string[] {
  return [
    "dados abertos",
    "municípios",
    "finanças públicas",
    "educação",
    "Brasil",
    ...extra,
  ];
}

/**
 * As fontes de que este site deriva, para `isBasedOn`.
 *
 * ## Por que `CreativeWork` e não `Dataset`
 *
 * Achado em 04/09/2026, pela **inspeção do Search Console** — e não pelo meu
 * validador, que só conferia presença de campo e dava tudo certo.
 *
 * Tipadas como `Dataset`, estas entradas viram **conjuntos de dados próprios
 * na página**, e o Google as valida como tais: *"O campo `description` não foi
 * encontrado — 1 erro crítico"*, uma vez por fonte. A página de Imperatriz
 * declarava três datasets, dois deles stubs inválidos.
 *
 * `Dataset` é subtipo de `CreativeWork`. Citar a fonte como `CreativeWork` diz
 * **"o dado veio daqui"** sem alegar que este site publica aquele conjunto —
 * que é a verdade, e é o que tira os stubs da validação sem inventar
 * `description` para um dataset de terceiro.
 *
 * **A lição:** meu validador afirmava o que eu tinha pensado em conferir. O
 * Search Console afirma o que o Google de fato exige. Quando os dois discordam,
 * quem manda é quem lê.
 */
export const FONTES = [
  {
    "@type": "CreativeWork",
    name: "IBGE — Agregados",
    url: "https://servicodados.ibge.gov.br",
  },
  {
    "@type": "CreativeWork",
    name: "SICONFI — Tesouro Nacional",
    url: "https://apidatalake.tesouro.gov.br",
  },
  {
    "@type": "CreativeWork",
    name: "INEP — IDEB",
    url: "https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb",
  },
] as const;
