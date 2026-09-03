import { expandir } from "../../../../lib/dados";
import { cabecalhosCsv, paraCsv } from "../../../../lib/csv";
import { resumirEstado, slugUf } from "../../../../lib/estado";
import { funcoesDe } from "../../../../lib/fiscal";
import { lerFiscal, lerSnapshot } from "../../../../lib/servidor";

/**
 * Os municípios de um estado em CSV.
 *
 * Fica entre os dois que já existiam: o do município serve a quem olha uma
 * cidade, o da base inteira a quem compara o Nordeste. Este serve a quem
 * trabalha com um estado — que é o recorte de quase todo jornal local e de
 * quase todo tribunal de contas.
 *
 * Formato **largo**, como o da base completa: uma linha por município, para
 * ordenar e filtrar direto na planilha.
 */
export const dynamic = "force-static";

export async function generateStaticParams() {
  const snapshot = await lerSnapshot();
  return snapshot.ufs.map((u) => ({ uf: slugUf(u.sigla) }));
}

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ uf: string }> },
) {
  const { uf } = await params;
  const [snapshot, fiscal] = await Promise.all([lerSnapshot(), lerFiscal()]);
  const r = resumirEstado(snapshot, fiscal, expandir(snapshot), uf.toUpperCase());
  if (!r) return new Response("não encontrado", { status: 404 });

  const indicadores = snapshot.indicadores;
  const cabecalho = [
    "codigo_ibge", "municipio", "uf",
    ...indicadores.map((i) => i.codigo),
    "pessoal_pct_rcl", "pessoal_limite_prudencial", "pessoal_publicou",
    "pessoal_exercicio", "pessoal_periodo",
    "despesa_liquidada_total", "despesa_educacao", "despesa_saude",
    "despesa_exercicio", "despesa_periodo",
  ];

  const acha = (
    fn: ReturnType<typeof funcoesDe>,
    nome: string,
  ): number | null => fn?.fatias.find((x) => x.nome === nome)?.valor ?? null;

  const linhas = r.municipios.map((m) => {
    const fn = funcoesDe(fiscal, m.codigo);
    return [
      m.codigo, m.nome, m.uf,
      ...indicadores.map((i) => m.valores[i.codigo] ?? null),
      m.fiscal?.percentual ?? null,
      m.fiscal?.limitePrudencial ?? null,
      // A mesma distinção da base completa: "não entregou" e "não consultado"
      // não podem colapsar num campo vazio, que seria as duas coisas.
      m.fiscal?.publicou === null || m.fiscal?.publicou === undefined
        ? "nao_consultado"
        : m.fiscal.publicou ? "sim" : "nao",
      fiscal.exercicio, fiscal.periodo,
      fn?.total ?? null,
      acha(fn, "Educação"),
      acha(fn, "Saúde"),
      fiscal.funcoes?.exercicio ?? null,
      fiscal.funcoes?.periodo ?? null,
    ];
  });

  return new Response(paraCsv(cabecalho, linhas), {
    headers: cabecalhosCsv(`numerospublicos-${slugUf(r.uf.sigla)}.csv`),
  });
}
