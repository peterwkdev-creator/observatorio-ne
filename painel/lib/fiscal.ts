/**
 * O snapshot fiscal, e a junção dele com o do IBGE. **Módulo puro** — sem I/O.
 *
 * `dados/fiscal.json` é produzido pelo motor do `sys-painel-fiscal`
 * (`python -m fiscal exportar`) e **copiado para cá**, versionado. A entrega é
 * explícita de propósito: um build que buscasse dado de outro repositório
 * falharia em silêncio no dia em que aquele repositório mudasse.
 *
 * A chave da junção é o **código IBGE do município** — a mesma dos dois lados,
 * e a razão de os dois sistemas conversarem sem nenhuma tradução.
 */

export type Faixa =
  | "implausivel"
  | "acima-legal"
  | "acima-prudencial"
  | "abaixo"
  | "sem-dado";

/**
 * A faixa do plausivel: **entre 0 e 100%**.
 *
 * Acima de 100% o municipio declara gastar mais com pessoal do que TODA a sua
 * receita; abaixo de zero, declara gasto negativo. Nenhum dos dois descreve uma
 * prefeitura -- descrevem um formulario preenchido errado.
 *
 * Os dois extremos apareceram no dado real de 2024, e por motivos diferentes:
 *
 * - Guaratinga/BA declarou **371,02%** (R$ 110 mi sobre R$ 29,6 mi).
 * - Paripueira/AL declarou **despesa negativa** e portanto **-19,35%**.
 *
 * O caso negativo e o mais perigoso, e por uma razao que custou perceber: ele e
 * **internamente coerente**. `despesa / RCL` da exatamente -19,35%, entao a
 * conferencia NAO o acusa -- coerencia nao e plausibilidade. E num ranking por
 * percentual ele iria para o **fim da lista**, parecendo o municipio mais
 * economico do Nordeste.
 *
 * Exibidos como declarados e marcados. Corrigir seria inventar numero; esconder
 * seria escolher quais declaracoes o leitor pode ver.
 */
export const LIMITE_PLAUSIVEL = 100;
export const MINIMO_PLAUSIVEL = 0;

/** Uma linha do snapshot fiscal, no formato compacto de array. */
export type LinhaFiscal = [
  codigo: number,
  nome: string,
  uf: string,
  populacao: number | null,
  /** `null` = ainda não consultado; `false` = consultado e não entregou. */
  publicou: boolean | null,
  percentual: number | null,
  limitePrudencial: number | null,
  despesa: number | null,
  rclAjustada: number | null,
];

export type SnapshotFiscal = {
  geradoEm: string;
  coletadoEm: string | null;
  fonte: string;
  exercicio: number;
  periodo: number;
  limites: { prudencial: number; legal: number };
  cobertura: {
    universo: number;
    consultados: number;
    publicaram: number;
    municipiosIbgeNoNordeste: number;
  };
  colunas: string[];
  municipios: LinhaFiscal[];
  colunasSerie: string[];
  /**
   * Série histórica por código IBGE. Um número sozinho não diz se o município
   * está melhorando ou piorando — e é essa a pergunta que a foto esconde.
   * Entre 2024/2 e 2024/3, Salvador caiu de 33,22% para 32,37% e Imperatriz
   * subiu de 57,63% para 60,64%: mesmo cartão, movimentos opostos.
   */
  serie: Record<string, PontoSerie[]>;
  periodos: [exercicio: number, periodo: number][];
  /** A despesa por função. `null` enquanto a varredura não tiver rodado. */
  funcoes: Funcoes | null;
};

/**
 * O que o município gasta por função orçamentária — as 28 da Portaria MOG
 * 42/1999: educação, saúde, urbanismo, assistência social, e assim por diante.
 *
 * O percentual com pessoal responde "cabe no limite?". Esta é a **outra**
 * pergunta, a que nenhum percentual responde: *para onde vai o dinheiro?* São
 * eixos independentes — Salvador compromete 32% da receita com pessoal e
 * destina 24% do orçamento à saúde, e nem um número prevê o outro.
 *
 * ## O formato é esparso, e por quê
 *
 * Cada município declara ~14 das 28 funções. Emitir as 28 com `null` nas outras
 * dobraria o arquivo para não dizer nada. Os rótulos saem uma vez só, ordenados
 * pela soma no Nordeste, e cada valor carrega o **índice** nesse array.
 *
 * ## A armadilha que já custou um número vinte vezes menor
 *
 * No relatório de origem cada função aparece **duas vezes**: no total e em
 * "Intra-Orçamentárias" (transferências entre órgãos do próprio município).
 * O motor Python filtra na leitura — Salvador em saúde é R$ 2,86 bi, não os
 * R$ 137 mi da leitura ingênua. Aqui já chega filtrado; não somar de novo.
 */
export type Funcoes = {
  exercicio: number;
  /** **Bimestre** (1..6). O RREO não usa a escala quadrimestral do RGF. */
  periodo: number;
  fonte: string;
  coletadoEm: string | null;
  cobertura: { consultados: number; publicaram: number; naoFecham: number };
  rotulos: string[];
  colunasMunicipio: string[];
  /** `{ "2927408": [totalDeclarado, [[indice, valor], ...]] }`, em reais inteiros. */
  porMunicipio: Record<string, EntradaFuncoes>;
  /**
   * O **mesmo bimestre do ano anterior**. `null` quando não foi coletado.
   *
   * Nunca o período anterior, e a diferença foi medida, não suposta. O RREO é
   * acumulado no ano: o 6º bimestre **contém** o 4º — mediana da razão b4/b6 de
   * **0,629** em 1.414 municípios, ou seja 63% do valor do 6º *é* o do 4º. A
   * fatia de cada função mal se mexe entre eles: deslocamento mediano de
   * **0,96 pp**. Uma frase de tendência ali seria ruído vestido de descoberta.
   *
   * Entre o mesmo bimestre de dois anos as acumulações são disjuntas, e o
   * deslocamento mediano sobe para **1,67 pp** — 42% das comparações movem 2
   * pontos ou mais, 25% movem 3 ou mais.
   */
  anterior: FuncoesAnterior | null;
};

export type FuncoesAnterior = {
  exercicio: number;
  periodo: number;
  coletadoEm: string | null;
  cobertura: { consultados: number; publicaram: number; naoFecham: number };
  /** Compartilha o array `rotulos` do bloco pai. */
  porMunicipio: Record<string, EntradaFuncoes>;
};

export type EntradaFuncoes = [
  total: number | null,
  valores: [indice: number, valor: number][],
];

/**
 * Quantas funções a Portaria MOG 42/1999 prevê.
 *
 * Constante da norma, **não** `rotulos.length`: aquele é quantas aparecem no
 * dado coletado, e os dois números só coincidem por acaso. Usar um no lugar do
 * outro produz uma frase que fica errada no dia em que uma função não for
 * declarada por ninguém — e ninguém vai perceber.
 */
export const FUNCOES_DA_PORTARIA = 28;

/** Uma função já com nome, valor e fatia do orçamento. */
export type FatiaFuncao = {
  nome: string;
  valor: number;
  /** `null` quando o total declarado é zero ou ausente — dividir por ele
   *  produziria `Infinity` ou `NaN`, e os dois viram "—" na tela sem que
   *  ninguém entenda por quê. */
  percentual: number | null;
};

/**
 * O deslocamento de fatia abaixo do qual a página diz "praticamente estável".
 *
 * **1,0 ponto percentual, e o número saiu da medição, não do gosto.** Sobre
 * 2.699 comparações de fatia (educação e saúde, 1.351 municípios, 2023/6 contra
 * 2024/6): o quartil inferior desloca 0,75 pp, a mediana 1,67 pp e o p90 4,78
 * pp. Cortar em 1,0 deixa **67%** das comparações com uma frase de movimento e
 * manda 33% para "estável" — e evita o erro que a série de pessoal quase
 * cometeu, de narrar tendência sobre um movimento que é ruído.
 */
export const DESLOCAMENTO_MINIMO = 1.0;

/**
 * A faixa de crescimento do gasto total que torna dois anos comparáveis.
 *
 * Medido: o crescimento nominal mediano de 2023 para 2024 foi de **1,193**
 * (19,3%), com p5 em 1,04 e p95 em 1,43; apenas 2% encolheram. Fora de
 * 0,5–3,0 não há município — há declaração quebrada num dos dois anos, e o
 * mínimo observado foi 0,0000 e o máximo 9,5.
 *
 * Igual à faixa de plausibilidade do percentual de pessoal: não corrige nada,
 * apenas se recusa a construir frase sobre número que não descreve o mundo.
 */
export const CRESCIMENTO_MINIMO = 0.5;
export const CRESCIMENTO_MAXIMO = 3.0;

export type Deslocamento = {
  nome: string;
  /** Fatia no período em destaque, em % do total declarado. */
  atual: number;
  /** Fatia no mesmo bimestre do ano anterior. */
  anterior: number;
  /** `atual - anterior`, em pontos percentuais. */
  pontos: number;
};

export type Comparacao = {
  exercicioAtual: number;
  exercicioAnterior: number;
  periodo: number;
  /** O crescimento nominal do gasto total entre os dois anos. */
  crescimento: number;
  /** As funções presentes nos dois anos, pela maior mudança em módulo. */
  deslocamentos: Deslocamento[];
};

/**
 * A mudança de composição do gasto entre o mesmo bimestre de dois anos.
 *
 * `null` quando falta um dos dois anos, quando algum total é zero ou negativo,
 * ou quando o crescimento cai fora da faixa comparável — nesse último caso um
 * dos relatórios está quebrado, e comparar publicaria uma mudança que não houve.
 */
export function compararFuncoes(
  s: SnapshotFiscal,
  codigo: number,
): Comparacao | null {
  const bloco = s.funcoes;
  const antes = bloco?.anterior;
  if (!bloco || !antes) return null;

  const a = bloco.porMunicipio[String(codigo)];
  const b = antes.porMunicipio[String(codigo)];
  if (!a || !b) return null;

  const [totalAtual, valoresAtual] = a;
  const [totalAntes, valoresAntes] = b;
  if (!totalAtual || !totalAntes || totalAtual <= 0 || totalAntes <= 0) return null;

  const crescimento = totalAtual / totalAntes;
  if (crescimento < CRESCIMENTO_MINIMO || crescimento > CRESCIMENTO_MAXIMO) {
    return null;
  }

  // Os dois lados compartilham `bloco.rotulos`, então o índice é a chave —
  // comparar por nome exigiria confiar que a grafia não mudou entre anos.
  const fatiaAntes = new Map(
    valoresAntes.map(([i, v]) => [i, (v * 100) / totalAntes]),
  );
  const deslocamentos: Deslocamento[] = [];
  for (const [i, v] of valoresAtual) {
    const anterior = fatiaAntes.get(i);
    // Função que não existia no ano anterior não tem deslocamento: tem
    // estreia. Tratá-la como "subiu de 0%" inventaria uma queda anterior que
    // ninguém declarou.
    if (anterior === undefined) continue;
    const atual = (v * 100) / totalAtual;
    deslocamentos.push({
      nome: bloco.rotulos[i] ?? `Função ${i}`,
      atual,
      anterior,
      pontos: atual - anterior,
    });
  }
  deslocamentos.sort((x, y) => Math.abs(y.pontos) - Math.abs(x.pontos));

  return {
    exercicioAtual: bloco.exercicio,
    exercicioAnterior: antes.exercicio,
    periodo: bloco.periodo,
    crescimento,
    deslocamentos,
  };
}

/**
 * As funções de um município, da maior para a menor, com a fatia de cada uma.
 *
 * `null` quando o município não entregou o RREO — e "não entregou" nunca pode
 * virar uma lista vazia que o leitor confunda com "não gastou nada".
 */
export function funcoesDe(
  s: SnapshotFiscal,
  codigo: number,
): { total: number | null; fatias: FatiaFuncao[] } | null {
  const bloco = s.funcoes;
  if (!bloco) return null;
  const entrada = bloco.porMunicipio[String(codigo)];
  if (!entrada) return null;
  const [total, valores] = entrada;
  const fatias = valores
    .map(([i, valor]) => ({
      // O índice vem de um arquivo gerado, mas o `?? ...` não é paranoia
      // decorativa: se o export mudar a ordem dos rótulos sem regerar o resto,
      // o rótulo faltante seria `undefined` impresso como texto na página.
      nome: bloco.rotulos[i] ?? `Função ${i}`,
      valor,
      percentual: total && total > 0 ? (valor * 100) / total : null,
    }))
    .sort((a, b) => b.valor - a.valor);
  return { total, fatias };
}

/** Um ponto da série: exercício, quadrimestre, publicou, percentual. */
export type PontoSerie = [
  exercicio: number,
  periodo: number,
  publicou: boolean,
  percentual: number,
];

/** O rótulo curto de um período: `2024/3`. */
export function rotuloPeriodo(exercicio: number, periodo: number): string {
  return `${exercicio}/${periodo}`;
}

/** Um ponto está na faixa que descreve uma prefeitura de verdade? */
export function pontoPlausivel(p: PontoSerie): boolean {
  return p[3] >= MINIMO_PLAUSIVEL && p[3] <= LIMITE_PLAUSIVEL;
}

/**
 * A variação entre o primeiro e o último ponto **plausível** da série.
 *
 * Filtrar os implausíveis não é preciosismo: sem isso, Paripueira/AL "subia
 * 114,95 pontos percentuais" partindo de um -19,35% que a própria página marca
 * como erro de preenchimento, e Guaratinga/BA "caía 254,55" partindo de 625%.
 * Frases construídas sobre números que a página declara inválidos.
 *
 * `null` quando sobram menos de dois pontos — uma série de um ponto não tem
 * tendência, e fingir que tem seria inventar informação.
 */
export function variacao(pontos: PontoSerie[] | undefined): number | null {
  const bons = (pontos ?? []).filter(pontoPlausivel);
  if (bons.length < 2) return null;
  // `at()` em vez de indexar: o tsconfig usa `noUncheckedIndexedAccess`, e ele
  // está certo em exigir a checagem -- série vazia existe.
  const primeiro = bons.at(0);
  const ultimo = bons.at(-1);
  if (!primeiro || !ultimo) return null;
  return ultimo[3] - primeiro[3];
}

export type Fiscal = {
  publicou: boolean | null;
  percentual: number | null;
  limitePrudencial: number | null;
  despesa: number | null;
  rclAjustada: number | null;
  faixa: Faixa;
};

export const ROTULO_FAIXA: Record<Faixa, string> = {
  implausivel: "Valor implausível — provável erro de preenchimento",
  "acima-legal": "Acima do limite legal",
  "acima-prudencial": "Acima do limite prudencial",
  abaixo: "Dentro do limite",
  "sem-dado": "Sem relatório entregue",
};

/** Onde o município cai em relação aos dois limites da Lei de
 *  Responsabilidade Fiscal. Sem percentual, a resposta é "não sei" — e "não
 *  sei" nunca pode virar "está abaixo". */
export function faixaDe(
  percentual: number | null,
  limitePrudencial: number | null,
  limites: SnapshotFiscal["limites"],
): Faixa {
  if (percentual === null) return "sem-dado";
  if (percentual > LIMITE_PLAUSIVEL) return "implausivel";
  if (percentual < MINIMO_PLAUSIVEL) return "implausivel";
  if (percentual > limites.legal) return "acima-legal";
  if (percentual > (limitePrudencial ?? limites.prudencial)) {
    return "acima-prudencial";
  }
  return "abaixo";
}

/** Índice por código IBGE, para juntar com o município do observatório. */
export function indexarFiscal(s: SnapshotFiscal): Map<number, Fiscal> {
  const mapa = new Map<number, Fiscal>();
  for (const [codigo, , , , publicou, percentual, limitePrudencial,
    despesa, rclAjustada] of s.municipios) {
    mapa.set(codigo, {
      publicou,
      percentual,
      limitePrudencial,
      despesa,
      rclAjustada,
      faixa: faixaDe(percentual, limitePrudencial, s.limites),
    });
  }
  return mapa;
}

/**
 * O identificador do município na URL: `imperatriz-ma`, `sao-luis-ma`.
 *
 * Acento fora, espaço vira hífen, UF no fim para desempatar homônimos — e há
 * muitos: "Bom Jesus" existe em cinco estados do Nordeste. Sem a UF no slug,
 * quatro dos cinco perderiam a própria página em silêncio.
 */
export function slugDe(nome: string, uf: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${uf.toLowerCase()}`;
}
