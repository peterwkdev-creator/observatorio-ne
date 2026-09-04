import {
  faixaDe, type FatiaFuncao, type SnapshotFiscal,
} from "./fiscal";

/**
 * O panorama dos 27 estados — o que só a varredura nacional tornou possível.
 *
 * ## A pergunta que faltava
 *
 * A página do município pergunta *"isso é muito?"* e responde contra o estado.
 * A página do estado não perguntava nada: mostrava quatro números soltos, sem
 * régua. Enquanto só o Nordeste estava varrido não havia contra o que comparar;
 * com os 5.570 municípios consultados, há.
 *
 * ## Duas medidas, e a segunda é a que surpreende
 *
 * **Mediana do gasto com pessoal** situa o estado na régua da Lei de
 * Responsabilidade Fiscal.
 *
 * **Taxa de entrega** — quantos municípios publicaram o relatório — é o achado
 * de 04/09/2026: ela varia de **100% a 14%**, e **não é regional**. Santa
 * Catarina entrega 86% e o Rio Grande do Sul 15%, vizinhos; a Bahia 99% e o
 * Maranhão 49%, ambos no Nordeste. Qualquer narrativa Norte/Sul sobre isso é
 * falsa, e o dado desmente sozinho.
 *
 * Ela também é a medida que **qualifica todas as outras**: a mediana de um
 * estado onde 15% entregaram descreve 15% do estado. Publicar a mediana sem a
 * taxa ao lado é oferecer precisão que o dado não tem.
 *
 * ## O que se recusa a fazer
 *
 * **Não ranqueia, não premia e não pune.** A tira ordena para poder mostrar
 * onde cada um cai, e é só isso: entregar relatório é obrigação legal, mas não
 * entregar tem causas que este painel não conhece — e um "27º lugar" afirma um
 * juízo que o número não sustenta. A régua é da lei; a leitura é de quem lê.
 */

/** Uma linha do panorama. */
export type PanoramaUf = {
  uf: string;
  /** Municípios do estado no snapshot fiscal. */
  municipios: number;
  /** Quantos entregaram o Relatório de Gestão Fiscal. */
  publicaram: number;
  /** `publicaram / municipios`, em pontos percentuais. */
  taxa: number;
  /**
   * A mediana do percentual de pessoal entre os que entregaram, ou `null`.
   *
   * **Mediana e não média:** um único município declarando 371% desloca a
   * média de duzentos quase dois pontos. Aqui os implausíveis já saem antes,
   * mas a mediana continua sendo a escolha certa por não depender disso.
   */
  mediana: number | null;
  /** Quantos entraram na mediana. Sem isto ela é número sem lastro. */
  base: number;
};

const MINIMO_MEDIANA = 10;

/** A mediana de uma lista já filtrada. Vazia devolve `null`, nunca zero. */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

/**
 * Uma linha por estado, em ordem alfabética de sigla.
 *
 * Alfabética e não ordenada por valor: quem chama decide a ordem de exibição,
 * e uma função que já devolve ordenado esconde essa decisão de quem lê o
 * código.
 */
export function panoramaEstados(fiscal: SnapshotFiscal): PanoramaUf[] {
  const por = new Map<string, { total: number; pub: number; vals: number[] }>();

  for (const [codigo, , uf, , publicou, percentual, limitePrudencial]
    of fiscal.municipios) {
    const chave = String(uf);
    const linha = por.get(chave) ?? { total: 0, pub: 0, vals: [] };
    linha.total += 1;

    const faixa = faixaDe(
      percentual as number | null,
      limitePrudencial as number | null,
      fiscal.limites,
      publicou as boolean | null,
      codigo as number,
    );
    // Quem presta contas como estado sai das DUAS contas: não entregou como
    // município porque não é um, e contá-lo como faltoso é a acusação que a
    // faixa `como-estado` existe para impedir. Ver `PRESTA_COMO_ESTADO`.
    if (faixa === "como-estado") {
      linha.total -= 1;
      por.set(chave, linha);
      continue;
    }

    if (publicou) linha.pub += 1;
    // Só o plausível entra na mediana: 371% é formulário preenchido errado,
    // não município caro, e empurraria a mediana do estado inteiro.
    if (faixa !== "implausivel" && typeof percentual === "number") {
      linha.vals.push(percentual);
    }
    por.set(chave, linha);
  }

  return [...por.entries()]
    .filter(([, x]) => x.total > 0)
    .map(([uf, x]) => ({
      uf,
      municipios: x.total,
      publicaram: x.pub,
      taxa: (x.pub / x.total) * 100,
      // Abaixo de 10 comparáveis não há mediana que descreva um estado —
      // mesma régua do gráfico de distribuição do município.
      mediana: x.vals.length >= MINIMO_MEDIANA ? mediana(x.vals) : null,
      base: x.vals.length,
    }))
    .sort((a, b) => a.uf.localeCompare(b.uf));
}

/** Onde uma UF cai numa lista de valores: quantos ficam abaixo dela. */
export function posicaoNaLista(
  valor: number,
  todos: number[],
): { abaixo: number; de: number } {
  return {
    abaixo: todos.filter((v) => v < valor).length,
    de: todos.length,
  };
}

/**
 * A despesa por função somada no país inteiro.
 *
 * ## O que a capa não respondia
 *
 * "Para onde vai o dinheiro" existia na página do município e na do estado. A
 * capa — a página que recebe a busca genérica e que apresenta o site — listava
 * indicadores e estados, e não dizia para onde vai o dinheiro do país. O dado
 * já estava no disco desde que a varredura nacional fechou.
 *
 * ## Soma de valores absolutos, nunca média de percentuais
 *
 * A média das fatias daria a São Paulo e a um município de 3 mil habitantes o
 * mesmo peso na composição do gasto do Brasil — o que descreve uma média de
 * prefeituras, não o país. A fatia sai da soma, no fim.
 *
 * ## O total é a soma dos totais DECLARADOS
 *
 * E não a soma das funções. Os dois são iguais em todo município cujo relatório
 * fecha (**0 de 3.243 não fecharam**), e usar o declarado mantém a régua sendo
 * a da fonte, e não a nossa.
 *
 * ## O que este número NÃO é
 *
 * Não é o gasto público brasileiro: é o dos **municípios que entregaram o
 * RREO** — cerca de 58% deles. Quem chamar isto de "gasto dos municípios
 * brasileiros" está errado por quase metade, e por isso a cobertura sai junto,
 * no mesmo objeto, para nenhuma página poder publicar um sem o outro.
 */
export type PanoramaFuncoes = {
  total: number;
  fatias: FatiaFuncao[];
  /** Quantos municípios entraram na soma. */
  municipios: number;
  exercicio: number;
  periodo: number;
};

export function funcoesDoPais(fiscal: SnapshotFiscal): PanoramaFuncoes | null {
  const bloco = fiscal.funcoes;
  if (!bloco) return null;

  const soma = new Map<number, number>();
  let total = 0;
  let municipios = 0;

  for (const entrada of Object.values(bloco.porMunicipio)) {
    const [declarado, valores] = entrada;
    municipios += 1;
    total += declarado ?? 0;
    for (const [i, valor] of valores) {
      soma.set(i, (soma.get(i) ?? 0) + valor);
    }
  }
  if (!municipios || total <= 0) return null;

  const fatias = [...soma.entries()]
    .map(([i, valor]) => ({
      // Mesmo cuidado de `funcoesDe`: rótulo faltante viraria `undefined`
      // impresso como texto se o export mudasse a ordem sem regerar o resto.
      nome: bloco.rotulos[i] ?? `Função ${i}`,
      valor,
      percentual: (valor * 100) / total,
    }))
    .sort((a, b) => b.valor - a.valor);

  return {
    total, fatias, municipios,
    exercicio: bloco.exercicio,
    periodo: bloco.periodo,
  };
}
