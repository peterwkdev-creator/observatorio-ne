/**
 * Onde um município fica em relação aos vizinhos. **Módulo puro.**
 *
 * ## A pergunta que o site não respondia
 *
 * A página diz que Imperatriz comprometeu **60,64%** da receita com pessoal, e
 * põe o limite legal ao lado. Isso responde "está dentro da lei?" — e deixa
 * intacta a pergunta que qualquer leitor faz em seguida: **"isso é muito?"**
 *
 * Um limite legal é uma régua absoluta. Ela não diz se o município é um caso
 * isolado ou se metade do estado está no mesmo lugar — e essas duas situações
 * pedem leituras completamente diferentes da mesma porcentagem.
 *
 * ## Percentil, e o cuidado de dizer sobre quem
 *
 * "Acima de 78% dos municípios do Maranhão" só significa alguma coisa se
 * estiver claro **quais** municípios entraram na conta. Aqui entram apenas os
 * que **entregaram o relatório** e cujo percentual é **plausível**:
 *
 * - quem não entregou não tem número, e tratá-lo como zero poria o município
 *   no fim da fila por não ter prestado contas — o inverso da verdade;
 * - Guaratinga/BA declarou 371%: mantido, ele empurraria todos os outros um
 *   degrau para baixo por causa de um erro de preenchimento.
 *
 * A base entra em toda frase que usa o percentil. Sem ela, "acima de 78%" pode
 * ser 78% de 217 municípios ou de 3.
 */

import { pontoPlausivel, type PontoSerie } from "./fiscal";

export type Posicao = {
  /** Quantos, entre os comparáveis, têm percentual MENOR que o deste. */
  abaixo: number;
  /** Quantos entraram na comparação — os que entregaram com valor plausível. */
  base: number;
  /** `abaixo / base`, de 0 a 100. */
  percentil: number;
  /** A mediana do conjunto, para dizer o "normal" contra o qual se compara. */
  mediana: number;
  /** Todos os valores comparáveis, ordenados. Para desenhar a distribuição. */
  valores: number[];
};

/** Um município é comparável quando entregou E o número descreve o mundo. */
function comparavel(p: number | null | undefined): p is number {
  return p !== null && p !== undefined && p >= 0 && p <= 100;
}

/**
 * A posição de um percentual dentro de um conjunto.
 *
 * `null` quando faltam comparáveis: com menos de **dez**, "acima de 66% dos
 * municípios" descreve dois vizinhos e soa como uma estatística. Dez é o
 * mínimo em que a frase não engana mais do que informa.
 */
export function posicaoEntre(
  percentual: number | null | undefined,
  doConjunto: (number | null | undefined)[],
  minimo = 10,
): Posicao | null {
  if (!comparavel(percentual)) return null;
  const valores = doConjunto.filter(comparavel).sort((a, b) => a - b);
  if (valores.length < minimo) return null;

  const abaixo = valores.filter((v) => v < percentual).length;
  const meio = Math.floor(valores.length / 2);
  const mediana =
    valores.length % 2 === 0
      ? ((valores[meio - 1] ?? 0) + (valores[meio] ?? 0)) / 2
      : valores[meio] ?? 0;

  return {
    abaixo,
    base: valores.length,
    percentil: (abaixo * 100) / valores.length,
    mediana,
    valores,
  };
}

/**
 * A série de um município reduzida ao último ponto plausível.
 *
 * Usada para montar o conjunto de comparação a partir da série histórica
 * quando o período em destaque não tem valor — mas **não** é o caso hoje:
 * o conjunto vem do próprio snapshot fiscal. Fica aqui porque a alternativa
 * seria repetir o filtro de plausibilidade em quem chamar.
 */
export function ultimoPlausivel(pontos: PontoSerie[] | undefined): number | null {
  const bons = (pontos ?? []).filter(pontoPlausivel);
  return bons.length ? bons[bons.length - 1]![3] : null;
}

/**
 * Onde um município cai entre os do seu estado, num indicador qualquer.
 *
 * ## A pergunta que faltava nas páginas magras
 *
 * 99 das 5.571 páginas (2%) ficavam abaixo de 700 palavras — quase todas de
 * municípios que só têm o dado do IBGE, sem relatório fiscal e sem IDEB.
 * Elas diziam "8.943 habitantes" e paravam ali. **Um número sozinho não
 * responde a pergunta que a pessoa tem**, que é se aquilo é grande ou pequeno.
 *
 * ## E por que isto vai em TODAS as páginas, não só nas magras
 *
 * O critério que decidiu: **se vale numa página magra, vale em todas; se só
 * vale na magra, é enchimento.** Saber que um município é o 512º de 853 em
 * população é útil para quem abre a página de Açucena e para quem abre a de
 * Uberlândia. Acrescentar só onde falta conteúdo seria engordar para o
 * buscador, que é exatamente o que a política de conteúdo em escala do Google
 * chama de abuso — e seria, além disso, admitir que o texto não presta.
 *
 * ## O que se recusa a fazer
 *
 * **Não chama de "ranking" e não imprime posição sozinha.** "512º" sem o total
 * não diz nada; "512º de 853" diz. E população não é mérito: o texto situa,
 * não classifica.
 *
 * Municípios **sem o valor ficam fora da conta** — não no fim. Não saber a
 * população de um município não o torna o menor do estado, e um denominador
 * que inclui desconhecidos descreve outra coisa.
 */
export type PosicaoNoEstado = {
  /** Quantos municípios do estado têm valor MENOR. */
  abaixo: number;
  /** Quantos entraram na comparação — o denominador honesto. */
  de: number;
  /** A mediana do estado, para servir de régua ao lado da posição. */
  mediana: number;
};

export function posicaoNoEstado(
  valor: number | null | undefined,
  doEstado: readonly (number | null | undefined)[],
  /** Abaixo disto não há distribuição que descreva um estado. */
  minimo = 5,
): PosicaoNoEstado | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  const vals = doEstado.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (vals.length < minimo) return null;
  const ordenados = [...vals].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return {
    abaixo: vals.filter((v) => v < valor).length,
    de: vals.length,
    mediana: ordenados.length % 2
      ? ordenados[meio]!
      : (ordenados[meio - 1]! + ordenados[meio]!) / 2,
  };
}
