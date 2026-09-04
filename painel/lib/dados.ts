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
  /** "Nordeste", "Sudeste"... Entrou com a expansão nacional: 27 UFs numa
   *  lista plana obrigam o leitor a varrer a tabela inteira. */
  regiao: string;
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
  return expandirLinhas(snapshot.municipios, snapshot.indicadores.map((i) => i.codigo));
}

/**
 * A mesma expansão, a partir das linhas cruas.
 *
 * Existe para que o **componente de cliente** receba os arrays compactos e
 * expanda no navegador, em vez de receber os objetos já expandidos.
 *
 * A diferença é medida, não estética: o payload da capa tinha **269 KB** com
 * objetos expandidos, porque cada município repetia `codigo`, `nome`, `uf` e as
 * três chaves de indicador — 1.794 vezes. E como toda página do site linkava
 * para a capa, o Next pré-buscava esses 269 KB em **todas** elas.
 *
 * Com 5.570 municípios (o Brasil inteiro) seriam ~840 KB. É a diferença entre
 * a expansão nacional ser possível e não ser.
 */
export function expandirLinhas(
  linhas: LinhaMunicipio[],
  codigos: string[],
): Municipio[] {
  return linhas.map(([codigo, nome, uf, ...valores]) => ({
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

/**
 * Um valor em reais na grandeza em que uma pessoa fala dele.
 *
 * Existe porque o painel estava publicando **"R$ 62.981.326 mil"** para o PIB
 * de Salvador. É fiel à unidade que o IBGE usa (*Mil Reais*) e hostil a quem
 * lê: são oito dígitos que ainda precisam ser multiplicados por mil de cabeça.
 * Ninguém faz essa conta — os olhos escorregam e o número não é lido.
 *
 * Devolve o texto curto **e o exato**, porque escalar é para ler, não para
 * esconder: o valor cheio vai no `title` e no CSV, e continua conferível.
 *
 * O plural segue o uso jornalístico brasileiro, que concorda com a parte
 * inteira: `R$ 1,5 bilhão`, `R$ 2,3 bilhões`.
 */
export function escala(reais: number | null | undefined): {
  curto: string;
  exato: string;
} {
  if (reais === null || reais === undefined) return { curto: "—", exato: "—" };
  const exato = `R$ ${br(reais, 2)}`;
  const abs = Math.abs(reais);

  const nomear = (divisor: number, singular: string, plural: string) => {
    const n = reais / divisor;
    const casas = Math.abs(n) >= 100 ? 0 : 2;
    const inteiro = Math.floor(Math.abs(n));
    return `R$ ${br(n, casas)} ${inteiro >= 2 ? plural : singular}`;
  };

  // **Só milhão para cima.** Abaixo disso a escala PIORA a leitura: "R$ 28.168"
  // é imediato e "R$ 28,17 mil" obriga a desfazer a conta. Escalar existe para
  // encurtar dígito demais, não para encurtar por encurtar.
  //
  // O trilhão entrou com a expansão nacional, em 03/09/2026. No Nordeste o
  // maior valor era o PIB da Bahia, R$ 352 bilhões, e o caso nunca aparecia;
  // no país, São Paulo publicava **"R$ 2.720 bilhões"** e o total do Brasil,
  // "R$ 9.012 bilhões". Tecnicamente certo, e exatamente o que esta função
  // existe para impedir: um número que o leitor tem de converter de cabeça.
  if (abs >= 1e12) return { curto: nomear(1e12, "trilhão", "trilhões"), exato };
  if (abs >= 1e9) return { curto: nomear(1e9, "bilhão", "bilhões"), exato };
  if (abs >= 1e6) return { curto: nomear(1e6, "milhão", "milhões"), exato };
  return { curto: `R$ ${br(reais, 0)}`, exato };
}

/**
 * O valor de um indicador na forma em que uma pessoa o lê, **decidindo pela
 * unidade que a própria fonte declara**.
 *
 * A capa publicava o PIB nacional como **"9.012.142.031"** com "Mil Reais" ao
 * lado — dez dígitos que ainda precisam ser multiplicados por mil de cabeça.
 * É exatamente o defeito que `escala()` foi criada para corrigir nas páginas de
 * município, e que a capa nunca recebeu: ali eram oito dígitos, e passou.
 *
 * A decisão sai de `unidade`, e não de uma lista de códigos de indicador. Um
 * indicador novo em reais é escalado sozinho; um em pessoas continua contado.
 * Amarrar isto ao código do indicador exigiria lembrar de mexer aqui a cada
 * indicador novo — e ninguém lembra.
 */
export function valorDoIndicador(
  valor: number | null | undefined,
  unidade: string,
): { curto: string; exato: string; unidadeVisivel: string } {
  if (/mil\s*reais/i.test(unidade)) {
    const e = escala(milReaisParaReais(valor));
    return { ...e, unidadeVisivel: "" };
  }
  return { curto: br(valor), exato: br(valor), unidadeVisivel: unidade };
}

/**
 * O PIB do IBGE vem em **Mil Reais**, não em reais.
 *
 * A unidade está no snapshot e é fácil de ignorar — e ignorá-la erra o valor
 * por um fator de mil, em silêncio, num número que ninguém confere de cabeça.
 * Esta função existe para que a conversão tenha um único lugar e um nome.
 */
export function milReaisParaReais(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : v * 1000;
}

/**
 * Monta a descrição dentro do limite útil, **descartando a cauda em vez de
 * cortá-la**.
 *
 * ~155 caracteres é onde o Google trunca o trecho no resultado de busca. A
 * primeira versão disto cortava no meio da palavra e terminava com reticências
 * — "do Tesouro Nacional e do…" —, o que parece erro e desperdiça o pouco
 * espaço que sobrava.
 *
 * Aqui a frase de procedência é **opcional**: entra se couber inteira, e some
 * se não couber. Ela é a parte com menos valor de diferenciação (é idêntica em
 * todas as páginas) e a que, portanto, deve ceder primeiro.
 *
 * Mora aqui, e não na página, porque a de estado precisa dela pelo mesmo
 * motivo — e enquanto esteve numa só, a outra cortava no meio da palavra.
 */
export function descricaoDe(principal: string, cauda: string, limite = 155): string {
  const inteira = `${principal} ${cauda}`;
  if (inteira.length <= limite) return inteira;
  if (principal.length <= limite) return principal;
  const corte = principal.lastIndexOf(" ", limite - 1);
  return `${principal.slice(0, corte > 0 ? corte : limite - 1)}…`;
}
