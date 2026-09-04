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
