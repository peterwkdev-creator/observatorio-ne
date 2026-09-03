/**
 * Agregação por unidade da federação. **Módulo puro** — sem I/O.
 *
 * Existe por uma razão medida, não por simetria de navegação. Em 03/09/2026,
 * das 1.794 páginas de município, **1.677 (93%) não recebiam um único link
 * interno**: a home renderiza a tabela num componente de cliente, então o HTML
 * dela não tem `href` para município nenhum, e o bloco "outros municípios" de
 * cada página aponta sempre para os 12 maiores do estado — os mesmos 117 no
 * site inteiro, cada um com 416 links entrando.
 *
 * O sitemap faz o Google **descobrir** as URLs. Link interno é outra coisa: é
 * o que distribui autoridade e diz o que importa. Página que só existe no
 * sitemap é página conhecida e sem motivo para ranquear.
 *
 * A página de estado fecha o grafo: 9 páginas listando **todos** os seus
 * municípios põem as 1.677 órfãs a dois cliques da home.
 */

import type { Municipio, Snapshot, UF } from "./dados";
import {
  faixaDe, funcoesDe, slugDe,
  type FatiaFuncao, type Faixa, type Fiscal, type SnapshotFiscal,
} from "./fiscal";

/** A sigla como aparece na URL: `/estado/ma/`. */
export function slugUf(sigla: string): string {
  return sigla.toLowerCase();
}

export type MunicipioDoEstado = Municipio & {
  slug: string;
  fiscal: Fiscal | null;
};

export type ResumoEstado = {
  uf: UF;
  municipios: MunicipioDoEstado[];
  /** Quantos municípios em cada faixa do limite legal. */
  porFaixa: Record<Faixa, number>;
  /**
   * A média do percentual de pessoal no estado, **excluindo os implausíveis**.
   *
   * Um único 371% entre duzentos municípios move a média quase dois pontos, e
   * média contaminada por erro de digitação é erro factual na página. `null`
   * quando não sobra nenhum valor plausível — média de nada não é zero.
   */
  mediaPessoal: number | null;
  /** Quantos entraram na média acima. Sem isto ela é um número sem lastro. */
  baseMedia: number;
  /** A despesa por função somada no estado, da maior para a menor. */
  funcoes: { total: number; fatias: FatiaFuncao[]; municipios: number } | null;
};

const FAIXAS_ZERADAS = (): Record<Faixa, number> => ({
  implausivel: 0,
  "acima-legal": 0,
  "acima-prudencial": 0,
  abaixo: 0,
  "sem-dado": 0,
});

export function resumirEstado(
  snapshot: Snapshot,
  fiscal: SnapshotFiscal,
  municipiosExpandidos: Municipio[],
  sigla: string,
): ResumoEstado | null {
  const uf = snapshot.ufs.find((u) => u.sigla === sigla);
  if (!uf) return null;

  const porCodigo = new Map(
    fiscal.municipios.map(([codigo, , , , publicou, percentual,
      limitePrudencial, despesa, rclAjustada]) => [codigo, {
      publicou, percentual, limitePrudencial, despesa, rclAjustada,
      faixa: faixaDe(percentual, limitePrudencial, fiscal.limites),
    } satisfies Fiscal]),
  );

  const municipios = municipiosExpandidos
    .filter((m) => m.uf === sigla)
    .map((m) => ({
      ...m,
      slug: slugDe(m.nome, m.uf),
      fiscal: porCodigo.get(m.codigo) ?? null,
    }))
    // Ordem alfabética, não por população. A lista é o caminho do rastreador e
    // do leitor até 417 municípios; ordenada por tamanho, encontrar "Abaiara"
    // exige varrer tudo. Alfabética é a única ordem em que se procura sem ler.
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const porFaixa = FAIXAS_ZERADAS();
  for (const m of municipios) porFaixa[m.fiscal?.faixa ?? "sem-dado"] += 1;

  const plausiveis = municipios
    .map((m) => m.fiscal)
    .filter((f): f is Fiscal =>
      f !== null && f.percentual !== null && f.faixa !== "implausivel")
    .map((f) => f.percentual as number);
  const mediaPessoal = plausiveis.length
    ? plausiveis.reduce((s, v) => s + v, 0) / plausiveis.length
    : null;

  return {
    uf,
    municipios,
    porFaixa,
    mediaPessoal,
    baseMedia: plausiveis.length,
    funcoes: somarFuncoes(fiscal, municipios),
  };
}

/**
 * Soma a despesa por função de todos os municípios do estado.
 *
 * Somar **valores absolutos**, não médias de percentual. A média das fatias
 * daria a cada município o mesmo peso — Salvador e um município de 3 mil
 * habitantes pesando igual na composição do gasto da Bahia, o que não descreve
 * o estado. A fatia sai da soma, no fim.
 *
 * O total é a soma dos totais **declarados**, e não a soma das funções: são
 * iguais em todo município cujo relatório fecha (0 de 1.414 não fecharam), e
 * usar o declarado mantém a régua sendo a da fonte, não a nossa.
 */
function somarFuncoes(
  fiscal: SnapshotFiscal,
  municipios: MunicipioDoEstado[],
): ResumoEstado["funcoes"] {
  if (!fiscal.funcoes) return null;
  const soma = new Map<string, number>();
  let total = 0;
  let quantos = 0;
  for (const m of municipios) {
    const f = funcoesDe(fiscal, m.codigo);
    if (!f) continue;
    quantos += 1;
    total += f.total ?? 0;
    for (const fatia of f.fatias) {
      soma.set(fatia.nome, (soma.get(fatia.nome) ?? 0) + fatia.valor);
    }
  }
  if (!quantos || total <= 0) return null;
  const fatias = [...soma.entries()]
    .map(([nome, valor]) => ({ nome, valor, percentual: (valor * 100) / total }))
    .sort((a, b) => b.valor - a.valor);
  return { total, fatias, municipios: quantos };
}

/**
 * Os vizinhos que a página de um município oferece.
 *
 * **Vizinhos na ordem alfabética do estado, não os 12 maiores.** A versão
 * anterior mandava toda página do Maranhão para os mesmos 12 municípios, e o
 * resultado medido foi 93% do site sem nenhum link entrando. Uma janela que
 * anda com o município espalha os links: cada página linka vizinhos diferentes,
 * e a cadeia percorre o estado inteiro.
 *
 * A janela é circular de propósito — sem isso, o primeiro e o último da ordem
 * alfabética receberiam metade dos links dos demais.
 */
export function vizinhosDe(
  doEstado: { codigo: number; nome: string; slug: string }[],
  codigo: number,
  quantos = 12,
): { codigo: number; nome: string; slug: string }[] {
  const i = doEstado.findIndex((m) => m.codigo === codigo);
  if (i < 0 || doEstado.length <= 1) return [];
  const n = Math.min(quantos, doEstado.length - 1);
  const saida = [];
  for (let k = 1; k <= n; k += 1) {
    saida.push(doEstado[(i + k) % doEstado.length]!);
  }
  return saida;
}
