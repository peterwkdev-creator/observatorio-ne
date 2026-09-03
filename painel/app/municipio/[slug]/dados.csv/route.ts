import { expandir } from "../../../../lib/dados";
import { cabecalhosCsv, paraCsv } from "../../../../lib/csv";
import { funcoesDe, slugDe } from "../../../../lib/fiscal";
import { trajetoriaDe } from "../../../../lib/ideb";
import { lerFiscal, lerIdeb, lerSnapshot } from "../../../../lib/servidor";

/**
 * O dado de um município em CSV, para quem quiser conferir ou reusar.
 *
 * A orientação oficial de painéis de dados públicos é explícita: os dados de
 * origem têm de estar disponíveis em formato legível por máquina. Um site que
 * se diz de dados abertos e só deixa **olhar** está pela metade — e o número
 * que ninguém consegue baixar é o número que ninguém consegue contestar.
 *
 * Route handler estático: com `output: "export"` isto vira um arquivo no
 * build, um por município, sem servidor nenhum.
 */
export const dynamic = "force-static";

export async function generateStaticParams() {
  const snapshot = await lerSnapshot();
  return expandir(snapshot).map((m) => ({ slug: slugDe(m.nome, m.uf) }));
}

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const [snapshot, fiscal, ideb, idebFinais] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerIdeb("anos_finais"),
  ]);
  const m = expandir(snapshot).find((x) => slugDe(x.nome, x.uf) === slug);
  if (!m) return new Response("não encontrado", { status: 404 });

  const serie = fiscal.serie[String(m.codigo)] ?? [];

  // Formato longo (uma observação por linha), não largo. É o que permite
  // acrescentar indicador ou período sem mudar o cabeçalho -- e o que qualquer
  // ferramenta de análise espera receber.
  const linhas: (string | number | null)[][] = [];
  const comum = [m.codigo, m.nome, m.uf];

  for (const ind of snapshot.indicadores) {
    linhas.push([...comum, ind.nome, ind.periodo ?? "", m.valores[ind.codigo] ?? null,
      ind.unidade, "IBGE", ind.coletadoEm ?? ""]);
  }
  // A série JÁ contém o período em destaque. Emitir os dois duplicaria a
  // observação no arquivo -- e observação repetida num CSV vira média errada
  // na planilha de quem baixou, em silêncio.
  for (const [ex, pe, , pct] of serie) {
    linhas.push([...comum, "Despesa com pessoal (% da RCL ajustada)",
      `${ex}/${pe}`, pct, "%", "SICONFI", fiscal.coletadoEm ?? ""]);
  }

  // A despesa por função entra como linhas novas, e não como colunas: é
  // exatamente o que o formato longo compra. Um CSV largo precisaria de 28
  // colunas a mais no cabeçalho, e o cabeçalho é o que quebra a planilha de
  // quem já baixou o arquivo antes.
  const funcoes = funcoesDe(fiscal, m.codigo);
  const periodoFuncoes = fiscal.funcoes
    ? `${fiscal.funcoes.exercicio}/${fiscal.funcoes.periodo}`
    : "";
  for (const f of funcoes?.fatias ?? []) {
    linhas.push([...comum, `Despesa liquidada — ${f.nome}`, periodoFuncoes,
      f.valor, "R$", "SICONFI", fiscal.funcoes?.coletadoEm ?? ""]);
  }
  if (funcoes?.total !== null && funcoes?.total !== undefined) {
    linhas.push([...comum, "Despesa liquidada — total declarado",
      periodoFuncoes, funcoes.total, "R$", "SICONFI",
      fiscal.funcoes?.coletadoEm ?? ""]);
  }

  // O mesmo bimestre do ano anterior, quando coletado. Em formato longo isto
  // são apenas linhas com outro `periodo` -- nenhuma coluna muda, e quem já
  // baixou o arquivo antes continua abrindo do mesmo jeito.
  const antes = fiscal.funcoes?.anterior;
  const entradaAntes = antes?.porMunicipio[String(m.codigo)];
  if (antes && entradaAntes) {
    const [totalAntes, valoresAntes] = entradaAntes;
    const periodoAntes = `${antes.exercicio}/${antes.periodo}`;
    for (const [i, valor] of valoresAntes) {
      linhas.push([...comum,
        `Despesa liquidada — ${fiscal.funcoes?.rotulos[i] ?? `Função ${i}`}`,
        periodoAntes, valor, "R$", "SICONFI", antes.coletadoEm ?? ""]);
    }
    if (totalAntes !== null) {
      linhas.push([...comum, "Despesa liquidada — total declarado",
        periodoAntes, totalAntes, "R$", "SICONFI", antes.coletadoEm ?? ""]);
    }
  }

  // O IDEB entra como linhas, uma por edição e etapa. As duas etapas ficam em
  // indicadores DIFERENTES: têm escalas próprias, e uma coluna só convidaria
  // quem baixou a compará-las.
  for (const [snap, etapa] of [[ideb, "anos iniciais"], [idebFinais, "anos finais"]] as const) {
    const t = trajetoriaDe(snap, m.codigo);
    for (const ponto of t?.pontos ?? []) {
      linhas.push([...comum, `IDEB rede municipal — ${etapa}`,
        String(ponto.edicao), ponto.observado, "índice 0 a 10", "INEP",
        snap.coletadoEm ?? ""]);
      if (ponto.projecao !== null) {
        linhas.push([...comum, `Meta do IDEB — ${etapa}`,
          String(ponto.edicao), ponto.projecao, "índice 0 a 10", "INEP",
          snap.coletadoEm ?? ""]);
      }
    }
  }

  const csv = paraCsv(
    ["codigo_ibge", "municipio", "uf", "indicador", "periodo", "valor",
     "unidade", "fonte", "coletado_em"],
    linhas,
  );
  return new Response(csv, { headers: cabecalhosCsv(`${slug}.csv`) });
}
