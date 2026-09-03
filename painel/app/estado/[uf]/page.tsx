import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import FuncoesBarras from "../../componentes/funcoes-barras";
import { br, escala, expandir, milReaisParaReais } from "../../../lib/dados";
import { resumirEstado, slugUf } from "../../../lib/estado";
import { ROTULO_FAIXA } from "../../../lib/fiscal";
import { lerFiscal, lerSnapshot, SITE } from "../../../lib/servidor";
import estilos from "./estado.module.css";

/**
 * Uma página por estado — nove delas.
 *
 * **Existe para consertar o grafo do site, não por simetria de navegação.**
 * Medido em 03/09/2026: das 1.794 páginas de município, 1.677 (93%) não
 * recebiam um único link interno. A home renderiza a lista num componente de
 * cliente, então o HTML dela não tem `href` para município nenhum; e o bloco
 * "outros municípios" apontava sempre para os 12 maiores do estado — 117
 * páginas no site inteiro, com 416 links entrando em cada.
 *
 * O sitemap resolve **descoberta**. Não resolve autoridade: página que só
 * existe no sitemap é página que o Google conhece e não tem motivo para
 * ranquear. Listando aqui **todos** os municípios do estado, as 1.677 órfãs
 * passam a estar a dois cliques da home.
 *
 * O segundo motivo é que a trilha já prometia este nível: ela dizia
 * `Números Públicos › Maranhão › Imperatriz` com "Maranhão" em texto morto.
 */

async function carregar() {
  const [snapshot, fiscal] = await Promise.all([lerSnapshot(), lerFiscal()]);
  return { snapshot, fiscal, expandidos: expandir(snapshot) };
}

export async function generateStaticParams() {
  const { snapshot } = await carregar();
  return snapshot.ufs.map((u) => ({ uf: slugUf(u.sigla) }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ uf: string }> },
): Promise<Metadata> {
  const { uf } = await params;
  const { snapshot, fiscal, expandidos } = await carregar();
  const r = resumirEstado(snapshot, fiscal, expandidos, uf.toUpperCase());
  if (!r) return {};

  const acima = r.porFaixa["acima-legal"];
  return {
    title: `${r.uf.nome} — dados abertos dos ${r.uf.municipios} municípios`,
    description:
      `População, PIB, gasto com pessoal e despesa por função dos ` +
      `${r.uf.municipios} municípios ${crase(r.uf.nome)}. ` +
      (r.mediaPessoal !== null
        ? `Média de ${br(r.mediaPessoal, 2)}% da receita comprometida com ` +
          `pessoal, ${acima} acima do limite legal. `
        : "") +
      `Fonte: IBGE e SICONFI/Tesouro Nacional.`,
    alternates: { canonical: `${SITE}/estado/${slugUf(r.uf.sigla)}/` },
    openGraph: {
      title: `${r.uf.nome} — dados abertos`,
      description: `Os ${r.uf.municipios} municípios ${crase(r.uf.nome)}, com procedência.`,
      url: `${SITE}/estado/${slugUf(r.uf.sigla)}/`,
      locale: "pt_BR",
      type: "article",
    },
  };
}

/**
 * "do Maranhão", "da Bahia", "de Alagoas" — a preposição que o nome pede.
 *
 * Escrito à mão porque não há regra: é o gênero e o número do artigo que cada
 * estado carrega, e "de Sergipe" ao lado de "do Ceará" na mesma frase denuncia
 * texto gerado. Nove nomes cabem numa tabela.
 */
const CONTRACAO: Record<string, string> = {
  AL: "de Alagoas",
  BA: "da Bahia",
  CE: "do Ceará",
  MA: "do Maranhão",
  PB: "da Paraíba",
  PE: "de Pernambuco",
  PI: "do Piauí",
  RN: "do Rio Grande do Norte",
  SE: "de Sergipe",
};
function crase(nome: string): string {
  const achado = Object.values(CONTRACAO).find((v) => v.endsWith(nome));
  return achado ?? `de ${nome}`;
}

export default async function PaginaEstado(
  { params }: { params: Promise<{ uf: string }> },
) {
  const { uf } = await params;
  const { snapshot, fiscal, expandidos } = await carregar();
  const r = resumirEstado(snapshot, fiscal, expandidos, uf.toUpperCase());
  if (!r) notFound();

  const de = CONTRACAO[r.uf.sigla] ?? `de ${r.uf.nome}`;
  const pop = r.uf.totais["populacao-censo-2022"] ?? null;
  const pibReais = milReaisParaReais(r.uf.totais["pib-municipal"] ?? null);
  const quadrimestre = `${fiscal.periodo}º quadrimestre de ${fiscal.exercicio}`;
  const bimestre = fiscal.funcoes
    ? `${fiscal.funcoes.periodo}º bimestre de ${fiscal.funcoes.exercicio}`
    : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `Dados abertos dos municípios ${de}`,
    description:
      `População, PIB, despesa com pessoal e despesa liquidada por função ` +
      `dos ${r.uf.municipios} municípios ${de}, a partir das APIs públicas do ` +
      `IBGE e do SICONFI/Tesouro Nacional.`,
    url: `${SITE}/estado/${slugUf(r.uf.sigla)}/`,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    isAccessibleForFree: true,
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    spatialCoverage: {
      "@type": "Place",
      name: `${r.uf.nome}, Brasil`,
    },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE}/estado/${slugUf(r.uf.sigla)}/dados.csv`,
        name: `Municípios ${de} em CSV`,
      },
    ],
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/">Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{r.uf.nome}</span>
      </nav>

      <header>
        <h1 className={estilos.titulo}>
          {r.uf.nome} <span className={estilos.uf}>{r.uf.sigla}</span>
        </h1>
        <p className={estilos.chamada}>
          Os <strong>{br(r.uf.municipios)} municípios</strong> {de}, com
          população, PIB, gasto com pessoal e despesa por função — cada número
          com a sua fonte e a data em que foi coletado.
        </p>
      </header>

      <section className={estilos.grade} aria-label="Totais do estado">
        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>População</h2>
          <p className={`${estilos.valor} tabular`}>{br(pop)}</p>
          <p className={estilos.fonte}>Censo 2022 · IBGE</p>
        </article>

        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>PIB somado</h2>
          <p className={`${estilos.valor} tabular`} title={escala(pibReais).exato}>
            {escala(pibReais).curto}
          </p>
          <p className={estilos.fonte}>a preços correntes · IBGE</p>
        </article>

        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>Média de gasto com pessoal</h2>
          <p className={`${estilos.valor} tabular`}>
            {r.mediaPessoal === null ? "—" : `${br(r.mediaPessoal, 2)}%`}
          </p>
          <p className={estilos.fonte}>
            média de {br(r.baseMedia)} municípios · {quadrimestre} · SICONFI
          </p>
        </article>

        <article className={`${estilos.cartao} ${estilos.destaque}`}>
          <h2 className={estilos.rotulo}>Acima do limite legal</h2>
          <p className={`${estilos.valor} tabular`}>
            {br(r.porFaixa["acima-legal"])}
          </p>
          <p className={estilos.fonte}>
            de {br(r.uf.municipios)} municípios, no {quadrimestre}
          </p>
        </article>
      </section>

      <section className={estilos.texto}>
        <h2>Onde os municípios {de} estão em relação ao limite</h2>
        <p>
          A Lei de Responsabilidade Fiscal fixa{" "}
          <strong>{br(fiscal.limites.legal, 2)}%</strong> da receita corrente
          líquida ajustada como teto para o Executivo municipal, e{" "}
          <strong>{br(fiscal.limites.prudencial, 2)}%</strong> como limite
          prudencial. No {quadrimestre}:
        </p>
        <ul className={estilos.faixas}>
          {(["acima-legal", "acima-prudencial", "abaixo", "implausivel",
            "sem-dado"] as const).map((f) => (
            <li key={f} className={estilos[f]}>
              <strong className="tabular">{br(r.porFaixa[f])}</strong>{" "}
              {ROTULO_FAIXA[f].toLowerCase()}
            </li>
          ))}
        </ul>
        {/* Só quando há o que excluir. Com zero implausíveis a frase virava
            "exclui os 0 fora da faixa", que anuncia uma correção que não
            aconteceu e faz o leitor procurar um problema inexistente. */}
        {r.porFaixa.implausivel > 0 ? (
          <p className={estilos.ressalva}>
            A média acima <strong>exclui os {br(r.porFaixa.implausivel)}</strong>{" "}
            fora da faixa de 0 a 100%. Um município que declara 371% da receita
            em pessoal move a média de duzentos quase dois pontos — e média
            contaminada por erro de preenchimento é erro na página, não detalhe.
          </p>
        ) : (
          <p className={estilos.ressalva}>
            Nenhum município {de} declarou percentual fora da faixa de 0 a
            100%, então a média acima usa todos os {br(r.baseMedia)} que
            entregaram o relatório.
          </p>
        )}
      </section>

      {r.funcoes && (
        <section className={estilos.texto}>
          <h2>Para onde vai o dinheiro {de}</h2>
          <p>
            No {bimestre}, os <strong>{br(r.funcoes.municipios)}</strong>{" "}
            municípios que entregaram o relatório liquidaram{" "}
            <strong>{escala(r.funcoes.total).curto}</strong> de despesa. A soma
            é de valores absolutos, não a média das fatias: dar o mesmo peso a
            uma capital e a um município de três mil habitantes descreveria uma
            média, não o estado.
          </p>
          <div className={estilos.rolagem}>
            <FuncoesBarras
              fatias={r.funcoes.fatias}
              total={r.funcoes.total}
              municipio={r.uf.nome}
            />
          </div>
        </section>
      )}

      <section className={estilos.texto} id="municipios">
        <h2>Os {br(r.uf.municipios)} municípios {de}</h2>
        <p>
          Em ordem alfabética. O percentual é o que o próprio município
          declarou ao SICONFI no {quadrimestre}; travessão significa que o
          relatório não foi entregue — não zero.
        </p>
      </section>

      <div className={estilos.rolagem}>
        <table className={estilos.lista}>
          <caption className="so-leitor">
            Municípios {de}, com população e gasto com pessoal.
          </caption>
          <thead>
            <tr>
              <th scope="col">Município</th>
              <th scope="col" className={estilos.num}>População</th>
              <th scope="col" className={estilos.num}>Pessoal / RCL</th>
              <th scope="col" className={estilos.situacao}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {r.municipios.map((m) => {
              const faixa = m.fiscal?.faixa ?? "sem-dado";
              return (
                <tr key={m.codigo}>
                  <th scope="row">
                    <Link href={`/municipio/${m.slug}/`}>{m.nome}</Link>
                  </th>
                  <td className={`${estilos.num} tabular`}>
                    {br(m.valores["populacao-censo-2022"] ?? null)}
                  </td>
                  <td className={`${estilos.num} tabular`}>
                    {m.fiscal?.percentual === null ||
                    m.fiscal?.percentual === undefined
                      ? "—"
                      : `${br(m.fiscal.percentual, 2)}%`}
                  </td>
                  <td className={estilos.situacao}>
                    <span className={`${estilos.selo} ${estilos[faixa]}`}>
                      {ROTULO_FAIXA[faixa]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className={estilos.texto}>
        <h2>Baixar estes dados</h2>
        <ul className={estilos.downloads}>
          <li>
            <a href={`/estado/${slugUf(r.uf.sigla)}/dados.csv`} download>
              Municípios {de} em CSV
            </a>{" "}
            <span className={estilos.fonte}>— uma linha por município</span>
          </li>
          <li>
            <a href="/dados/municipios.csv" download>Base completa em CSV</a>{" "}
            <span className={estilos.fonte}>
              — os {br(snapshot.municipios.length)} municípios do Nordeste
            </span>
          </li>
        </ul>
      </section>

      <section className={estilos.texto}>
        <h2>Outros estados</h2>
        <ul className={estilos.estados}>
          {snapshot.ufs
            .filter((u) => u.sigla !== r.uf.sigla)
            .map((u) => (
              <li key={u.sigla}>
                <Link href={`/estado/${slugUf(u.sigla)}/`}>{u.nome}</Link>
              </li>
            ))}
        </ul>
      </section>

      <footer className={estilos.rodape}>
        <p>
          Fontes: {snapshot.fonte} e {fiscal.fonte}
          {fiscal.coletadoEm
            ? ` · coleta fiscal em ${fiscal.coletadoEm.slice(0, 10)}`
            : ""}
          . Dados abertos, sob licença AGPL-3.0.
        </p>
      </footer>
    </main>
  );
}
