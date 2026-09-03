import { expandir } from "../../../lib/dados";
import { cabecalhosCsv, paraCsv } from "../../../lib/csv";
import { funcoesDe, indexarFiscal } from "../../../lib/fiscal";
import { lerFiscal, lerSnapshot } from "../../../lib/servidor";

/**
 * A base inteira num arquivo: 1.794 municípios, uma linha cada.
 *
 * O CSV por município serve a quem olha uma cidade; este serve a quem quer
 * comparar todas — jornalista, pesquisador, ou alguém conferindo se o painel
 * está mentindo. É o download que torna o resto verificável.
 *
 * Formato largo aqui, ao contrário do CSV por município: quem baixa a base
 * inteira quer uma linha por município para ordenar e filtrar direto.
 */
export const dynamic = "force-static";

export async function GET() {
  const [snapshot, fiscal] = await Promise.all([lerSnapshot(), lerFiscal()]);
  const porCodigo = indexarFiscal(fiscal);

  const indicadores = snapshot.indicadores;
  const cabecalho = [
    "codigo_ibge", "municipio", "uf",
    ...indicadores.map((i) => i.codigo),
    "pessoal_pct_rcl", "pessoal_limite_prudencial", "pessoal_publicou",
    "pessoal_exercicio", "pessoal_periodo",
    // Da despesa por função entram só o total e as duas maiores. As 28 viriam
    // com ~20 colunas vazias por linha para a maioria dos municípios, e quem
    // quiser a decomposição inteira tem o CSV do município, que é longo e a
    // traz completa. Aqui o que se quer é **comparar** 1.794 linhas.
    "despesa_liquidada_total", "despesa_educacao", "despesa_saude",
    "despesa_exercicio", "despesa_periodo",
  ];

  // `undefined` quando o município não entregou o RREO. Vira campo vazio no
  // CSV, e não zero: "não entregou" e "gastou nada" não podem colapsar na
  // mesma célula.
  const acha = (
    fn: ReturnType<typeof funcoesDe>,
    nome: string,
  ): number | null => fn?.fatias.find((x) => x.nome === nome)?.valor ?? null;

  const linhas = expandir(snapshot).map((m) => {
    const f = porCodigo.get(m.codigo);
    const fn = funcoesDe(fiscal, m.codigo);
    return [
      m.codigo, m.nome, m.uf,
      ...indicadores.map((i) => m.valores[i.codigo] ?? null),
      f?.percentual ?? null,
      f?.limitePrudencial ?? null,
      // `publicou` distingue "não entregou" de "não consultado", e essa
      // diferença tem de sobreviver ao download. Vazio seria as duas coisas.
      f?.publicou === null || f?.publicou === undefined
        ? "nao_consultado"
        : f.publicou ? "sim" : "nao",
      fiscal.exercicio, fiscal.periodo,
      fn?.total ?? null,
      acha(fn, "Educação"),
      acha(fn, "Saúde"),
      fiscal.funcoes?.exercicio ?? null,
      fiscal.funcoes?.periodo ?? null,
    ];
  });

  return new Response(paraCsv(cabecalho, linhas), {
    headers: cabecalhosCsv("numerospublicos-municipios.csv"),
  });
}
