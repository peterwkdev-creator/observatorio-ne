import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import FuncoesBarras from "../../componentes/funcoes-barras";
import Termo from "../../componentes/termo";
import { br, escala, expandir, milReaisParaReais } from "../../../lib/dados";
import { resumirEstado, slugUf } from "../../../lib/estado";
import { ROTULO_FAIXA } from "../../../lib/fiscal";
import { medianaUltimaEdicao } from "../../../lib/ideb";
import {
  coberturaTemporal, idCatalogo, palavrasChave, VARIAVEIS,
} from "../../../lib/jsonld";
import { lerFiscal, lerIdeb, lerSnapshot, SITE } from "../../../lib/servidor";
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
  const [snapshot, fiscal, ideb] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"),
  ]);
  return { snapshot, fiscal, ideb, expandidos: expandir(snapshot) };
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
    // Ver a nota do recorte em `municipio/[slug]/page.tsx`: ~155 caracteres é
    // onde o Google trunca, e a cauda era a mesma frase nas nove páginas.
    description:
      (`Os ${r.uf.municipios} municípios ${crase(r.uf.nome)}: ` +
        (r.mediaPessoal !== null
          ? `média de ${br(r.mediaPessoal, 2)}% da receita em pessoal, ` +
            `${acima} acima do limite legal. `
          : "") +
        `Dados oficiais, com a fonte.`).slice(0, 155),
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
 * Escrito à mão porque **não há regra**: é o gênero e o artigo que cada nome
 * carrega, e "de Sergipe" ao lado de "do Ceará" na mesma frase denuncia texto
 * gerado. Vinte e sete nomes cabem numa tabela; uma heurística por terminação
 * erraria em Alagoas, Goiás, Sergipe, Roraima e no Distrito Federal.
 */
const CONTRACAO: Record<string, string> = {
  AC: "do Acre",
  AL: "de Alagoas",
  AM: "do Amazonas",
  AP: "do Amapá",
  BA: "da Bahia",
  CE: "do Ceará",
  DF: "do Distrito Federal",
  ES: "do Espírito Santo",
  GO: "de Goiás",
  MA: "do Maranhão",
  MG: "de Minas Gerais",
  MS: "de Mato Grosso do Sul",
  MT: "de Mato Grosso",
  PA: "do Pará",
  PB: "da Paraíba",
  PE: "de Pernambuco",
  PI: "do Piauí",
  PR: "do Paraná",
  RJ: "do Rio de Janeiro",
  RN: "do Rio Grande do Norte",
  RO: "de Rondônia",
  RR: "de Roraima",
  RS: "do Rio Grande do Sul",
  SC: "de Santa Catarina",
  SE: "de Sergipe",
  SP: "de São Paulo",
  TO: "do Tocantins",
};
function crase(nome: string): string {
  const achado = Object.values(CONTRACAO).find((v) => v.endsWith(nome));
  return achado ?? `de ${nome}`;
}

export default async function PaginaEstado(
  { params }: { params: Promise<{ uf: string }> },
) {
  const { uf } = await params;
  const { snapshot, fiscal, ideb, expandidos } = await carregar();
  const r = resumirEstado(snapshot, fiscal, expandidos, uf.toUpperCase());
  if (!r) notFound();

  // Mediana e não média: o IDEB vai de 0 a 10, e um punhado de municípios
  // pequenos com nota extrema desloca a média sem descrever o estado.
  const medIdeb = medianaUltimaEdicao(ideb, r.municipios.map((m) => m.codigo));

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
    // Ver a nota em `municipio/[slug]/page.tsx`: campos recomendados pela
    // documentação do Google para `Dataset`, que decidem se o conjunto aparece
    // descrito no Dataset Search.
    identifier: `${SITE}/estado/${slugUf(r.uf.sigla)}/`,
    keywords: palavrasChave([r.uf.nome, r.uf.sigla, "IDEB", "IBGE", "SICONFI"]),
    temporalCoverage: coberturaTemporal(snapshot, fiscal, ideb),
    variableMeasured: VARIAVEIS,
    includedInDataCatalog: { "@id": idCatalogo(SITE) },
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
        <Link href="/" prefetch={false}>Números Públicos</Link>
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
          <h2 className={estilos.rotulo}>
            Média de{" "}
            <Termo
              ancora="pessoal"
              bloco
              dica="O percentual da receita corrente líquida ajustada que cada município declarou comprometido com pessoal. A média exclui os implausíveis — fora da faixa de 0 a 100%."
            >
              gasto com pessoal
            </Termo>
          </h2>
          <p className={`${estilos.valor} tabular`}>
            {r.mediaPessoal === null ? "—" : `${br(r.mediaPessoal, 2)}%`}
          </p>
          <p className={estilos.fonte}>
            média de {br(r.baseMedia)} municípios · {quadrimestre} · SICONFI
          </p>
        </article>

        {medIdeb && (
          <article className={estilos.cartao}>
            <h2 className={estilos.rotulo}>IDEB mediano</h2>
            <p className={`${estilos.valor} tabular`}>
              {br(medIdeb.mediana, 1)}
            </p>
            <p className={estilos.fonte}>
              <Termo
                ancora="ideb"
                bloco
                dica="O índice do INEP que combina aprendizado e fluxo escolar, de 0 a 10. Aqui é a rede municipal — a que a prefeitura administra —, e não a rede pública, que inclui escolas estaduais."
              >
                rede municipal
              </Termo>
              , anos iniciais · {medIdeb.edicao} · INEP
              <br />
              mediana de {br(medIdeb.base)} municípios, escala de 0 a 10
            </p>
          </article>
        )}

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
            "sem-dado", "nao-consultado"] as const)
            // Faixa vazia não vira linha: "0 ainda não consultado" é ruído
            // depois que a varredura fecha, e some sozinho quando fecha.
            .filter((f) => r.porFaixa[f] > 0)
            .map((f) => (
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
              const faixa = m.fiscal?.faixa ?? "nao-consultado";
              return (
                <tr key={m.codigo}>
                  <th scope="row">
                    {/* Ver a nota em `municipio/[slug]/page.tsx`: 645 links
                        nesta tabela, e a pré-busca especulativa dos que cabem
                        na tela custa centenas de KB antes de qualquer clique. */}
                    <Link href={`/municipio/${m.slug}/`} prefetch={false}>
                      {m.nome}
                    </Link>
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
              — os {br(snapshot.municipios.length)} municípios do país
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
                <Link href={`/estado/${slugUf(u.sigla)}/`} prefetch={false}>
                  {u.nome}
                </Link>
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
