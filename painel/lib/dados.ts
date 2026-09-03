/**
 * Tipos e formatação — **puro, sem I/O**.
 *
 * Este módulo é importado tanto pelo Server Component quanto pelo Client
 * Component, então **não pode tocar em `node:fs` nem `node:path`**. A primeira
 * versão misturava a leitura do arquivo aqui, e o build quebrou com
 * `UnhandledSchemeError: Reading from "node:path" is not handled by plugins` —
 * o webpack tentando levar o módulo de sistema de arquivos para o navegador.
 *
 * A leitura do snapshot mora em `lib/servidor.ts`, que só o servidor importa.
 */

export type Indicador = {
  codigo: string;
  nome: string;
  unidade: string;
  agregado: number;
  variavel: number;
  periodo: string | null;
  origem: string | null;
  coletadoEm: string | null;
  totalRegiao: number | null;
};

export type UF = {
  sigla: string;
  nome: string;
  municipios: number;
  totais: Record<string, number | null>;
};

/** Município no formato compacto do snapshot: `[codigo, nome, uf, ...valores]`. */
export type LinhaMunicipio = [number, string, string, ...(number | null)[]];

export type Snapshot = {
  geradoEm: string;
  fonte: string;
  colunas: string[];
  indicadores: Indicador[];
  ufs: UF[];
  municipios: LinhaMunicipio[];
};

export type Municipio = {
  codigo: number;
  nome: string;
  uf: string;
  valores: Record<string, number | null>;
};

/**
 * Expande as linhas compactas para objetos.
 *
 * O snapshot guarda listas para não repetir o nome de cada campo 1.794 vezes —
 * o arquivo que o visitante baixa seria três vezes maior sem informação nova.
 * A expansão acontece **no build**, então o custo é zero para quem visita.
 */
export function expandir(snapshot: Snapshot): Municipio[] {
  const codigos = snapshot.indicadores.map((i) => i.codigo);
  return snapshot.municipios.map(([codigo, nome, uf, ...valores]) => ({
    codigo,
    nome,
    uf,
    valores: Object.fromEntries(
      codigos.map((c, i) => [c, valores[i] ?? null]),
    ) as Record<string, number | null>,
  }));
}

/** Número no formato brasileiro. `null` vira travessão, nunca zero. */
export function br(valor: number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined) return "—";
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** Data ISO em formato legível, com fuso de São Paulo. */
export function dataLegivel(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}
