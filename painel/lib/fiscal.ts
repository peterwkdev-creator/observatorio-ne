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
};

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
