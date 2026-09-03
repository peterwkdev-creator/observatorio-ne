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
 * Acima disto o número deixa de ser alarmante e passa a ser impossível.
 *
 * Gastar mais com pessoal do que TODA a receita corrente líquida não descreve
 * um município em crise: descreve um formulário preenchido errado. Seis dos
 * 1.414 que entregaram declararam isso no 3º quadrimestre de 2024 —
 * Guaratinga/BA marcou **371,02%**, R$ 110 milhões de despesa sobre R$ 29,6
 * milhões de receita, e a conta fecha com o que o próprio município enviou.
 *
 * Verificado direto na API antes de virar regra: a leitura está certa, a
 * declaração é que não está. Por isso o valor é **exibido como declarado e
 * marcado como implausível** — corrigir seria inventar um número, e esconder
 * seria escolher quais declarações o leitor pode ver.
 */
export const LIMITE_PLAUSIVEL = 100;

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

/**
 * A variação entre o primeiro e o último ponto da série, em pontos percentuais.
 * `null` quando há menos de dois pontos — uma série de um ponto não tem
 * tendência, e fingir que tem seria inventar informação.
 */
export function variacao(pontos: PontoSerie[] | undefined): number | null {
  if (!pontos || pontos.length < 2) return null;
  // `at()` em vez de indexar: o tsconfig usa `noUncheckedIndexedAccess`, e ele
  // está certo em exigir a checagem -- série vazia existe.
  const primeiro = pontos.at(0);
  const ultimo = pontos.at(-1);
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
