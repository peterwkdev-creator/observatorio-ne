import { expandir } from "../../../../lib/dados";
import { cabecalhosCsv, paraCsv } from "../../../../lib/csv";
import { slugDe } from "../../../../lib/fiscal";
import { lerFiscal, lerSnapshot } from "../../../../lib/servidor";

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
  const [snapshot, fiscal] = await Promise.all([lerSnapshot(), lerFiscal()]);
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

  const csv = paraCsv(
    ["codigo_ibge", "municipio", "uf", "indicador", "periodo", "valor",
     "unidade", "fonte", "coletado_em"],
    linhas,
  );
  return new Response(csv, { headers: cabecalhosCsv(`${slug}.csv`) });
}
