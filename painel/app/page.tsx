import Link from "next/link";

import { br, dataLegivel, expandir, valorDoIndicador } from "@/lib/dados";
import { slugUf } from "@/lib/estado";
import { coberturaTemporal, idCatalogo, palavrasChave, VARIAVEIS } from "@/lib/jsonld";
import { lerFiscal, lerIdeb, lerSnapshot, SITE } from "@/lib/servidor";
import { Municipios } from "./municipios";
import s from "./page.module.css";

/**
 * Server Component: lê o snapshot do disco **no build** e devolve HTML pronto.
 * Nada é buscado pelo navegador de quem visita.
 */
//: A ordem em que o IBGE lista as regiões, e a que todo brasileiro reconhece.
//: Alfabética poria Centro-Oeste antes de Norte e Nordeste, o que não é como
//: ninguém pensa no mapa.
const REGIOES = ["Norte", "Nordeste", "Sudeste", "Sul", "Centro-Oeste"];

export default async function Pagina() {
  const snapshot = await lerSnapshot();
  const municipios = expandir(snapshot);
  const [fiscal, ideb] = await Promise.all([
    lerFiscal(), lerIdeb("anos_iniciais"),
  ]);
  const coletadoEm =
    snapshot.indicadores.map((i) => i.coletadoEm).filter(Boolean).sort().at(-1) ??
    snapshot.geradoEm;

  // JSON-LD da capa. As páginas de município e de estado já declaravam
  // `Dataset`; a capa, que é a raiz do site e a que o Google encontra primeiro,
  // não declarava nada -- então o buscador via 1.804 conjuntos de dados sem um
  // que os agrupasse. `hasPart` faz esse papel.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE}/#site`,
        name: "Números Públicos",
        url: `${SITE}/`,
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE}/#autor` },
      },
      {
        "@type": "Person",
        "@id": `${SITE}/#autor`,
        name: "Peter Wilhelm Kretzschmar",
      },
      {
        // O catálogo que agrupa os 5.571 conjuntos por município. É a estrutura
        // que a documentação do Google descreve para coleções: `DataCatalog`
        // para o todo, `Dataset` para cada parte, e `includedInDataCatalog`
        // ligando as duas pontas. Sem ele, um índice de dados vê 5.571
        // conjuntos soltos e nada dizendo que são um só corpo.
        "@type": "DataCatalog",
        "@id": idCatalogo(SITE),
        name: "Números Públicos",
        url: `${SITE}/`,
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE}/#autor` },
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
      },
      {
        "@type": "Dataset",
        "@id": `${SITE}/#dados`,
        includedInDataCatalog: { "@id": idCatalogo(SITE) },
        identifier: `${SITE}/`,
        keywords: palavrasChave(["IBGE", "SICONFI", "INEP", "IDEB"]),
        name: "Dados abertos dos municípios brasileiros",
        description:
          `População, PIB, despesa com pessoal, despesa por função e IDEB dos ` +
          `${municipios.length} municípios dos 27 estados do Brasil, a ` +
          `partir das APIs públicas do IBGE, do SICONFI/Tesouro Nacional e do ` +
          `INEP, com a fonte e a data de coleta ao lado de cada número.`,
        url: `${SITE}/`,
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
        isAccessibleForFree: true,
        inLanguage: "pt-BR",
        creator: { "@id": `${SITE}/#autor` },
        // A cobertura temporal e espacial são o que distingue este conjunto de
        // qualquer outro que cite as mesmas fontes.
        temporalCoverage: coberturaTemporal(snapshot, fiscal, ideb),
        spatialCoverage: {
          "@type": "Place",
          name: "Brasil",
        },
        variableMeasured: VARIAVEIS,
        distribution: [
          {
            "@type": "DataDownload",
            encodingFormat: "text/csv",
            contentUrl: `${SITE}/dados/municipios.csv`,
            name: `Base completa: ${municipios.length} municípios em CSV`,
          },
        ],
        isBasedOn: [
          { "@type": "Dataset", name: "IBGE — Agregados", url: "https://servicodados.ibge.gov.br" },
          { "@type": "Dataset", name: "SICONFI — Tesouro Nacional", url: "https://apidatalake.tesouro.gov.br" },
          { "@type": "Dataset", name: "INEP — IDEB", url: "https://www.gov.br/inep" },
        ],
      },
    ],
  };

  return (
    <main className={s.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className={s.cabecalho}>
        <span className={s.selo}>Dados abertos · IBGE e Tesouro Nacional</span>
        <h1 className={s.titulo}>Números Públicos</h1>
        <p className={s.subtitulo}>
          População, PIB, gasto com pessoal, despesa por função e IDEB dos{" "}
          <strong>{br(municipios.length)} municípios</strong> dos 27 estados
          do Brasil — com a fonte e a data de coleta ao lado de cada número.
        </p>
        <p className={s.coletadoEm}>
          Última coleta em{" "}
          <time dateTime={coletadoEm}>{dataLegivel(coletadoEm)}</time>.
        </p>
      </header>

      <p className={s.aviso}>
        Trabalho independente, sem vínculo com nenhum órgão público e sem
        relação com qualquer processo de contratação. Começou pelo Nordeste,
        sobre um termo de referência público, e hoje cobre o país inteiro.
      </p>

      <section className={s.cartoes} aria-label="Totais da região">
        {snapshot.indicadores.map((ind) => (
          <article key={ind.codigo} className={s.cartao}>
            <h2 className={s.cartaoRotulo}>
              {ind.nome} · {ind.periodo}
            </h2>
            {/* Escalado pela unidade que a fonte declara. O total do PIB
                saía com dez dígitos e um "Mil Reais" ao lado; agora sai
                "R$ 9,01 trilhões", com o valor cheio no `title`. */}
            <p
              className={`${s.cartaoValor} tabular`}
              title={valorDoIndicador(ind.totalRegiao, ind.unidade).exato}
            >
              {valorDoIndicador(ind.totalRegiao, ind.unidade).curto}
              {valorDoIndicador(ind.totalRegiao, ind.unidade).unidadeVisivel && (
                <span className={s.cartaoUnidade}>
                  {valorDoIndicador(ind.totalRegiao, ind.unidade).unidadeVisivel}
                </span>
              )}
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
          Soma dos municípios de cada estado, agrupados por região. O total
          nacional confere com o agregado que o próprio IBGE publica — é assim
          que se sabe que a coleta está <strong>completa</strong>, e não apenas
          que um número está certo.
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
                    {i.nome}{" "}
                    <span className={s.ausente}>
                      ({i.periodo}
                      {/* A unidade estava só no cartão. Na tabela os números
                          ficam CRUS de propósito -- comparar 27 estados pede
                          coluna alinhada, e "R$ 2,72 tri" ao lado de
                          "R$ 857,59 bi" é pior de comparar que dois inteiros
                          --, mas então a unidade tem de estar dita aqui. */}
                      {i.unidade ? `, ${i.unidade.toLowerCase()}` : ""})
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {/* Agrupada por região, e não numa lista plana de 27 linhas.
                O `<tbody>` por região é o agrupamento que o HTML de tabela
                oferece de verdade — leitor de tela anuncia o cabeçalho do
                grupo, e não é só um estilo. */}
            {REGIOES.map((regiao) => (
              <tbody key={regiao}>
                <tr>
                  <th scope="colgroup" colSpan={2 + snapshot.indicadores.length}
                      className={s.grupo}>
                    {regiao}
                  </th>
                </tr>
              {snapshot.ufs.filter((u) => u.regiao === regiao).map((uf) => (
                <tr key={uf.sigla}>
                  <th scope="row">
                    {/* O unico link interno que a home tinha para conteudo era
                        nenhum: a lista de municipios e componente de cliente,
                        entao o HTML dela nao trazia `href` nenhum. Estes nove
                        links sao a raiz do grafo do site. */}
                    <Link href={`/estado/${slugUf(uf.sigla)}/`}>{uf.nome}</Link>{" "}
                    <span className={s.ausente}>({uf.sigla})</span>
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
            ))}
          </table>
        </div>
      </section>

      <Municipios linhas={snapshot.municipios} indicadores={snapshot.indicadores} />

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
