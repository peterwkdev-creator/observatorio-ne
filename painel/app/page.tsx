import { br, dataLegivel, expandir } from "@/lib/dados";
import { lerSnapshot } from "@/lib/servidor";
import { Municipios } from "./municipios";
import s from "./page.module.css";

/**
 * Server Component: lê o snapshot do disco **no build** e devolve HTML pronto.
 * Nada é buscado pelo navegador de quem visita.
 */
export default async function Pagina() {
  const snapshot = await lerSnapshot();
  const municipios = expandir(snapshot);
  const coletadoEm =
    snapshot.indicadores.map((i) => i.coletadoEm).filter(Boolean).sort().at(-1) ??
    snapshot.geradoEm;

  return (
    <main className={s.pagina} id="conteudo">
      <header className={s.cabecalho}>
        <span className={s.selo}>Dados abertos · IBGE</span>
        <h1 className={s.titulo}>Números Públicos</h1>
        <p className={s.subtitulo}>
          População, PIB e estimativa populacional dos{" "}
          <strong>{br(municipios.length)} municípios</strong> dos nove estados
          do Nordeste — com a fonte e a data de coleta ao lado de cada número.
        </p>
        <p className={s.coletadoEm}>
          Última coleta em{" "}
          <time dateTime={coletadoEm}>{dataLegivel(coletadoEm)}</time>.
        </p>
      </header>

      <p className={s.aviso}>
        Trabalho independente, construído sobre um termo de referência público.
        <strong> Sem vínculo com o Consórcio Nordeste ou o PNUD</strong>, e sem
        relação com qualquer processo de contratação.
      </p>

      <section className={s.cartoes} aria-label="Totais da região">
        {snapshot.indicadores.map((ind) => (
          <article key={ind.codigo} className={s.cartao}>
            <h2 className={s.cartaoRotulo}>
              {ind.nome} · {ind.periodo}
            </h2>
            <p className={`${s.cartaoValor} tabular`}>
              {br(ind.totalRegiao)}
              <span className={s.cartaoUnidade}>{ind.unidade}</span>
            </p>
            <p className={s.cartaoFonte}>
              IBGE, agregado {ind.agregado}, variável {ind.variavel}.{" "}
              {ind.origem ? (
                <a href={ind.origem} rel="nofollow noopener">
                  Ver a consulta na fonte
                </a>
              ) : null}
            </p>
          </article>
        ))}
      </section>

      <section className={s.secao} aria-labelledby="por-estado">
        <h2 className={s.secaoTitulo} id="por-estado">
          Por estado
        </h2>
        <p className={s.secaoNota}>
          Soma dos municípios de cada estado. O total da região confere com o
          agregado que o próprio IBGE publica — é assim que se sabe que a
          coleta está completa, e não apenas que um número está certo.
        </p>
        <div className={s.rolagem}>
          <table className={s.tabela}>
            <caption>
              Totais por unidade da federação, calculados a partir dos
              municípios.
            </caption>
            <thead>
              <tr>
                <th scope="col">Estado</th>
                <th scope="col" className={s.numero}>
                  Municípios
                </th>
                {snapshot.indicadores.map((i) => (
                  <th key={i.codigo} scope="col" className={s.numero}>
                    {i.nome} <span className={s.ausente}>({i.periodo})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.ufs.map((uf) => (
                <tr key={uf.sigla}>
                  <th scope="row">
                    {uf.nome} <span className={s.ausente}>({uf.sigla})</span>
                  </th>
                  <td className={`${s.numero} tabular`}>
                    {br(uf.municipios)}
                  </td>
                  {snapshot.indicadores.map((i) => (
                    <td
                      key={i.codigo}
                      className={`${s.numero} tabular ${
                        uf.totais[i.codigo] == null ? s.ausente : ""
                      }`}
                    >
                      {br(uf.totais[i.codigo])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Municipios municipios={municipios} indicadores={snapshot.indicadores} />

      <footer className={s.rodape}>
        <p>
          <strong>Procedência.</strong> Cada observação guarda quando foi
          coletada e de qual endpoint veio. Valor ausente na fonte aparece como
          “—”, nunca como zero: confundir “não sabemos” com “zero” é como um
          painel passa a mentir sem ninguém notar.
        </p>
        <p>
          <strong>Fonte.</strong> {snapshot.fonte}. Snapshot gerado em{" "}
          <time dateTime={snapshot.geradoEm}>
            {dataLegivel(snapshot.geradoEm)}
          </time>
          .
        </p>
        <p>
          <strong>Código aberto.</strong> Este painel é software livre sob a{" "}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener">
            GNU AGPL v3 ou posterior
          </a>
          . O código-fonte completo, incluindo o motor de ingestão, está em{" "}
          <a
            href="https://github.com/peterwkdev-creator/observatorio-ne"
            rel="noopener"
          >
            github.com/peterwkdev-creator/observatorio-ne
          </a>
          . Quem modificar e oferecer este serviço pela rede precisa
          disponibilizar o código correspondente — é a seção 13 da AGPL, e é o
          motivo de a licença ser esta e não a MIT.
        </p>
      </footer>
    </main>
  );
}
