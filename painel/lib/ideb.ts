/**
 * O IDEB por município, e a junção com o gasto em educação. **Módulo puro.**
 *
 * `dados/ideb.json` e `dados/ideb-finais.json` são produzidos pelo motor do
 * `sys-educacao-inep` (`python -m educacao exportar`) e copiados para cá,
 * versionados — a mesma costura explícita do snapshot fiscal.
 *
 * ## Por que este dado existe aqui e não num site próprio
 *
 * A página já diz que Imperatriz destina 38,1% do orçamento à educação. O INEP
 * publica o resultado que esse gasto produziu. Os dois usam o código IBGE, e
 * ninguém os cruza. **O valor está na junção**, não em nenhuma das pontas.
 *
 * ## O que este módulo se recusa a fazer
 *
 * **Não relaciona gasto e nota.** Exibir os dois lado a lado é justaposição;
 * afirmar que um explica o outro é pesquisa que ninguém aqui fez. Não há
 * função de correlação neste arquivo, e isso é deliberado.
 *
 * **Não mistura as duas etapas.** Anos iniciais e anos finais têm escalas
 * diferentes — a mediana do Nordeste em 2023 é 5,2 numa e 3,7 na outra. Somar
 * ou plotar as duas no mesmo eixo repetiria o erro do Tesouro Selic: números
 * de significados diferentes na mesma coluna.
 */

export type PontoIdeb = [
  /** Índice em `edicoes`, não o ano — o array de anos sai uma vez só. */
  indice: number,
  observado: number,
  /** A meta que o INEP fixou. `null` em 2005 e 2023 — ver `SEM_META`. */
  projecao: number | null,
];

export type SnapshotIdeb = {
  geradoEm: string;
  coletadoEm: string | null;
  fonte: string;
  /** `anos_iniciais` (1º ao 5º) ou `anos_finais` (6º ao 9º). */
  etapa: string;
  /** A rede lida. Sempre `Municipal` — ver o motor. */
  rede: string;
  edicoes: number[];
  /**
   * As edições em que o INEP **não publicou meta**.
   *
   * 2005 é a linha de base (as metas começam em 2007) e o primeiro ciclo do
   * IDEB encerrou em 2021 — a Portaria MEC 26/2024 criou grupo técnico para
   * definir as novas. Exibir meta para 2023 inventaria um alvo que não existe,
   * e exibir travessão sem explicar pareceria defeito do painel.
   */
  edicoesSemMeta: number[];
  colunasSerie: string[];
  /** `{ "2105302": ["Imperatriz", "MA"] }` */
  municipios: Record<string, [nome: string, uf: string]>;
  serie: Record<string, PontoIdeb[]>;
  /** Ressalvas da fonte por edição: `{ "2300150": [[5, "**"]] }`. */
  ressalvas: Record<string, [indice: number, marca: string][]>;
  /** O que cada marca significa, nas palavras do INEP. */
  legenda: Record<string, string>;
  cobertura: { municipios: number; observacoes: number; comRessalva: number };
};

export const ROTULO_ETAPA: Record<string, string> = {
  anos_iniciais: "anos iniciais (1º ao 5º ano)",
  anos_finais: "anos finais (6º ao 9º ano)",
};

export type EdicaoIdeb = {
  edicao: number;
  observado: number;
  projecao: number | null;
  /** `null` quando não há meta naquela edição — não é "não atingiu". */
  bateuMeta: boolean | null;
  /** A ressalva da fonte, já em português, quando houver. */
  ressalva: string | null;
};

export type Trajetoria = {
  etapa: string;
  rotuloEtapa: string;
  pontos: EdicaoIdeb[];
  primeiro: EdicaoIdeb;
  ultimo: EdicaoIdeb;
  /** Variação do primeiro ao último ponto, em pontos do índice. */
  variacao: number;
};

/**
 * A trajetória de um município numa etapa. `null` quando não há nenhum ponto.
 *
 * Um único ponto **não** é descartado: "o IDEB de 2023 foi 5,5" é informação
 * completa. O que não existe com um ponto é tendência, e quem apresenta é que
 * precisa checar `pontos.length` antes de falar em subida ou queda.
 */
export function trajetoriaDe(
  s: SnapshotIdeb,
  codigo: number,
): Trajetoria | null {
  const bruta = s.serie[String(codigo)];
  if (!bruta || bruta.length === 0) return null;

  const marcas = new Map(
    (s.ressalvas[String(codigo)] ?? []).map(([i, m]) => [i, m]),
  );

  const pontos: EdicaoIdeb[] = bruta.map(([i, observado, projecao]) => {
    const marca = marcas.get(i);
    return {
      edicao: s.edicoes[i] ?? 0,
      observado,
      projecao,
      // `null` e não `false`: sem meta, "não bateu" seria uma afirmação sobre
      // um alvo que não existe.
      bateuMeta: projecao === null ? null : observado >= projecao,
      ressalva: marca ? s.legenda[marca] ?? null : null,
    };
  });

  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  if (!primeiro || !ultimo) return null;

  return {
    etapa: s.etapa,
    rotuloEtapa: ROTULO_ETAPA[s.etapa] ?? s.etapa,
    pontos,
    primeiro,
    ultimo,
    variacao: ultimo.observado - primeiro.observado,
  };
}

/** Quantas edições da trajetória bateram a meta, entre as que tinham meta. */
export function contarMetas(t: Trajetoria): { bateu: number; comMeta: number } {
  const comMeta = t.pontos.filter((p) => p.bateuMeta !== null);
  return {
    bateu: comMeta.filter((p) => p.bateuMeta).length,
    comMeta: comMeta.length,
  };
}

/**
 * A mediana do IDEB de um conjunto de municípios, na edição mais recente.
 *
 * Mediana e não média: o IDEB é um índice limitado entre 0 e 10, e um punhado
 * de municípios pequenos com nota extrema desloca a média sem descrever o
 * conjunto. `null` quando ninguém tem valor — média de nada não é zero.
 */
export function medianaUltimaEdicao(
  s: SnapshotIdeb,
  codigos: number[],
): { mediana: number; edicao: number; base: number } | null {
  const ultimoIndice = s.edicoes.length - 1;
  const valores: number[] = [];
  for (const codigo of codigos) {
    const pontos = s.serie[String(codigo)];
    const ponto = pontos?.find(([i]) => i === ultimoIndice);
    if (ponto) valores.push(ponto[1]);
  }
  if (valores.length === 0) return null;
  valores.sort((a, b) => a - b);
  const meio = Math.floor(valores.length / 2);
  const mediana =
    valores.length % 2 === 0
      ? ((valores[meio - 1] ?? 0) + (valores[meio] ?? 0)) / 2
      : valores[meio] ?? 0;
  return {
    mediana,
    edicao: s.edicoes[ultimoIndice] ?? 0,
    base: valores.length,
  };
}
