import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import FuncoesBarras from "../../componentes/funcoes-barras";
import TiraEstados from "../../componentes/tira-estados";
import Termo from "../../componentes/termo";
import {
  br, concorda, descricaoDe, escala, expandir, fracaoDe, milReaisParaReais,
} from "../../../lib/dados";
import { resumirEstado, slugUf } from "../../../lib/estado";
import { ROTULO_FAIXA } from "../../../lib/fiscal";
import { medianaUltimaEdicao } from "../../../lib/ideb";
import { panoramaEstados, posicaoNaLista } from "../../../lib/nacional";
import {
  FONTES, VARIAVEIS, catalogoDe, coberturaTemporal, palavrasChave,
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
  const [snapshot, fiscal, ideb, idebFinais] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerIdeb("anos_finais"),
  ]);
  return { snapshot, fiscal, ideb, idebFinais, expandidos: expandir(snapshot) };
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
    // Concordância: o Distrito Federal tem UM ente, e "dos 1 municípios" no
    // título é o tipo de erro que faz o resultado de busca parecer gerado.
    title: r.uf.municipios === 1
      ? `${r.uf.nome} — dados abertos`
      : `${r.uf.nome} — dados abertos dos ${r.uf.municipios} municípios`,
    // Ver a nota do recorte em `municipio/[slug]/page.tsx`: ~155 caracteres é
    // onde o Google trunca, e a cauda era a mesma frase nas nove páginas.
    // O que aparece no Google, ANTES de a pessoa ver qualquer contexto da
    // página — por isso a contagem precisa carregar a base junto. "497
    // municípios ... 7 acima do limite legal" convida a ler 7/497, quando o
    // denominador é quem entregou: 75. E `descricaoDe` descarta a cauda em vez
    // de cortá-la no meio da palavra, que era o que o `.slice(155)` fazia.
    description: descricaoDe(
      (r.uf.municipios === 1
        ? `${r.uf.nome}: `
        : `Os ${r.uf.municipios} municípios ${crase(r.uf.nome)}: `) +
        (r.mediaPessoal !== null
          ? `${r.publicaram} entregaram relatório fiscal, ` +
            `média de ${br(r.mediaPessoal, 2)}% da receita em pessoal e ` +
            `${acima} acima do limite legal.`
          // Sem média há dois motivos MUITO diferentes, e escrever o errado é
          // acusar quem presta contas: o DF entrega o RGF na esfera estadual,
          // porque não é município. Ver `PRESTA_COMO_ESTADO`.
          : r.comoEstado === r.uf.municipios
            ? "presta contas como estado, e não como município."
            : `${r.publicaram === 0 ? "nenhum município entregou" : `${r.publicaram} entregaram`} relatório fiscal.`),
      "Dados oficiais, com a fonte.",
    ),
    alternates: { canonical: `${SITE}/estado/${slugUf(r.uf.sigla)}/` },
    openGraph: {
      title: `${r.uf.nome} — dados abertos`,
      description: r.uf.municipios === 1
        ? `${r.uf.nome}, com procedência.`
        : `Os ${r.uf.municipios} municípios ${crase(r.uf.nome)}, com procedência.`,
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
  const { snapshot, fiscal, ideb, idebFinais, expandidos } = await carregar();
  const r = resumirEstado(snapshot, fiscal, expandidos, uf.toUpperCase());
  if (!r) notFound();
  // Quem presta contas como estado sai da conta de ausentes: ele entregou, na
  // esfera onde de fato presta contas. Somá-lo aqui seria repetir, uma casa
  // adiante, o erro que a faixa `como-estado` existe para corrigir.
  const ausentes = r.uf.municipios - r.publicaram - r.comoEstado;

  // Os 27 estados, para situar este entre eles — o que só ficou possível com
  // a varredura nacional fechada. Ver a nota de desenho em `lib/nacional.ts`.
  const panorama = panoramaEstados(fiscal);
  const meu = panorama.find((x) => x.uf === r.uf.sigla);
  const posTaxa = meu
    ? posicaoNaLista(meu.taxa, panorama.map((x) => x.taxa))
    : null;
  const medianas = panorama
    .map((x) => x.mediana)
    .filter((v): v is number => v !== null);
  const posMediana = meu?.mediana != null
    ? posicaoNaLista(meu.mediana, medianas)
    : null;

  // Mediana e não média: o IDEB vai de 0 a 10, e um punhado de municípios
  // pequenos com nota extrema desloca a média sem descrever o estado.
  const medIdeb = medianaUltimaEdicao(ideb, r.municipios.map((m) => m.codigo));

  // Quantos municípios do estado NÃO têm rede municipal de ensino.
  //
  // O cartão dizia "mediana de N municípios" e parava ali, deixando o leitor
  // supor que o resto era lacuna da coleta. Não é: o INEP publica o IDEB por
  // REDE, e onde a prefeitura não administra as escolas não há linha municipal
  // a publicar. Verificado em 04/09/2026 reingerindo com `--rede Estadual`:
  // dos 138 sem rede municipal nos anos iniciais, 133 aparecem na estadual.
  //
  // O número dos anos finais é o que surpreende: no Paraná são 388 de 399.
  const semRede = r.municipios.filter(
    (m) => !ideb.municipios[String(m.codigo)]).length;
  const semRedeFinais = r.municipios.filter(
    (m) => !idebFinais.municipios[String(m.codigo)]).length;

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
      `${r.uf.municipios === 1 ? "do município" : `dos ${r.uf.municipios} municípios`} ` +
      `${de}, a partir das APIs públicas do ` +
      `IBGE e do SICONFI/Tesouro Nacional.`,
    url: `${SITE}/estado/${slugUf(r.uf.sigla)}/`,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    isAccessibleForFree: true,
    // As fontes de onde este conjunto deriva. Estava só nas páginas de
    // município e na capa; a de estado dizia de onde o dado vinha em PROSA e
    // não em metadado, e o Dataset Search lê o metadado. Também inclui o INEP,
    // que a página usa para o IDEB mediano.
    isBasedOn: FONTES,
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    // Ver a nota em `municipio/[slug]/page.tsx`: campos recomendados pela
    // documentação do Google para `Dataset`, que decidem se o conjunto aparece
    // descrito no Dataset Search.
    identifier: `${SITE}/estado/${slugUf(r.uf.sigla)}/`,
    keywords: palavrasChave([r.uf.nome, r.uf.sigla, "IDEB", "IBGE", "SICONFI"]),
    temporalCoverage: coberturaTemporal(snapshot, fiscal, ideb),
    variableMeasured: VARIAVEIS,
    includedInDataCatalog: catalogoDe(SITE),
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
          {r.uf.municipios === 1 ? "O" : "Os"}{" "}
          <strong>
            {r.uf.municipios === 1
              ? "município"
              : `${br(r.uf.municipios)} municípios`}
          </strong>{" "}
          {de}, com
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
            {r.baseMedia === 0
              ? "sem base para calcular"
              : `média de ${br(r.baseMedia)} ${r.baseMedia === 1 ? "município" : "municípios"}`}{" "}
            · {quadrimestre} · SICONFI
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
              {semRede > 0 && (
                <>
                  <br />
                  <strong>{br(semRede)}</strong>{" "}
                  {semRede === 1 ? "não tem" : "não têm"} rede municipal
                </>
              )}
            </p>
          </article>
        )}

        {r.publicaram === 0 ? (
          <article className={`${estilos.cartao} ${estilos["como-estado"]}`}>
            <h2 className={estilos.rotulo}>Limite legal</h2>
            <p className={`${estilos.valor} tabular`}>—</p>
            <p className={estilos.fonte}>
              {r.comoEstado === r.uf.municipios
                ? "Não se aplica: presta contas como estado, e não como município."
                : "Nenhum relatório municipal entregue no período."}
            </p>
          </article>
        ) : (
        <article className={`${estilos.cartao} ${estilos.destaque}`}>
          <h2 className={estilos.rotulo}>Acima do limite legal</h2>
          <p className={`${estilos.valor} tabular`}>
            {br(r.porFaixa["acima-legal"])}
          </p>
          {/* O denominador é quem ENTREGOU, nunca o total de municípios do
              estado. "7 de 497" convida a ler que 490 estão bem — quando 422
              deles apenas não prestaram contas, e sobre esses não se sabe
              nada. Ver a nota em `ResumoEstado.publicaram`. */}
          <p className={estilos.fonte}>
            de {br(r.publicaram)}{" "}
            {r.publicaram === 1 ? "município que entregou" : "que entregaram"}{" "}
            relatório, no {quadrimestre}
            {ausentes > 0 && (
              <>
                <br />
                <strong>{br(ausentes)}</strong>{" "}
                {ausentes === 1 ? "não entregou" : "não entregaram"}: sobre{" "}
                {ausentes === 1 ? "ele" : "esses"} não se sabe
              </>
            )}
            {r.comoEstado > 0 && (
              <>
                <br />
                {r.comoEstado === 1 ? "Outro ente presta" : `Outros ${br(r.comoEstado)} prestam`}{" "}
                contas como estado
              </>
            )}
          </p>
        </article>
        )}
      </section>

      <section className={estilos.texto}>
        <h2>
          {r.comoEstado === r.uf.municipios
            ? `O limite de pessoal ${de}`
            : `Onde os municípios ${de} estão em relação ao limite`}
        </h2>
        <p>
          A Lei de Responsabilidade Fiscal fixa{" "}
          <strong>{br(fiscal.limites.legal, 2)}%</strong> da receita corrente
          líquida ajustada como teto para o Executivo municipal, e{" "}
          <strong>{br(fiscal.limites.prudencial, 2)}%</strong> como limite
          prudencial. No {quadrimestre}:
        </p>
        <ul className={estilos.faixas}>
          {(["acima-legal", "acima-prudencial", "abaixo", "implausivel",
            "sem-dado", "nao-consultado", "como-estado"] as const)
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
        ) : r.baseMedia > 0 ? (
          <p className={estilos.ressalva}>
            Nenhum município {de} declarou percentual fora da faixa de 0 a
            100%, então a média acima usa {r.baseMedia === 1 ? "o único" : `todos os ${br(r.baseMedia)}`}{" "}
            que {r.baseMedia === 1 ? "entregou" : "entregaram"} o relatório.
          </p>
        ) : null}
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

      {/* O cartão do IDEB dizia "mediana de N municípios" e parava ali. Quem
          lê supõe lacuna de coleta; não é. O INEP publica por REDE, e onde a
          prefeitura não administra as escolas não há linha municipal.
          Verificado, não suposto — ver a nota em `semRede`. */}
      {(semRede > 0 || semRedeFinais > 0) && (
        <section className={estilos.texto}>
          <h2>Por que nem todo município {de} tem IDEB aqui</h2>
          <p>
            O INEP publica o IDEB <strong>por rede</strong>, e este site mostra
            a <strong>municipal</strong> — a que a prefeitura administra, e a
            única que pareia com o orçamento dela. Onde as escolas são de outra
            rede, não há número municipal a publicar.
          </p>
          <ul className={estilos.lista}>
            {semRede > 0 && (
              <li>
                <strong>{fracaoDe(semRede, r.uf.municipios)}</strong> {de}{" "}
                {concorda(semRede, r.uf.municipios, "não tem", "não têm")} rede
                municipal nos <strong>anos iniciais</strong> (1º ao 5º).
              </li>
            )}
            {semRedeFinais > 0 && (
              <li>
                <strong>{fracaoDe(semRedeFinais, r.uf.municipios)}</strong>{" "}
                {concorda(semRedeFinais, r.uf.municipios, "não tem", "não têm")}{" "}
                nos <strong>anos finais</strong> (6º ao 9º)
                {r.uf.municipios > 1 &&
                  ` — ${br((semRedeFinais * 100) / r.uf.municipios, 0)}% do estado`}
                .
              </li>
            )}
          </ul>
          <p className={estilos.ressalva}>
            <strong>Isto não é lacuna da coleta.</strong> É como a educação
            básica está dividida, e varia muito entre estados: no Paraná{" "}
            <strong>388 dos 399</strong> municípios não têm rede própria nos
            anos finais, enquanto em 16 unidades da federação nenhum município
            fica de fora nos anos iniciais. O gasto municipal com educação
            continua aparecendo — ele existe mesmo onde a rede é de outro ente.
          </p>
        </section>
      )}

      {/* A pergunta que a página do município faz e a do estado não fazia.
          Só ficou possível com os 5.570 municípios consultados — antes disso
          não havia contra o que comparar. Ver `lib/nacional.ts`. */}
      {meu && posTaxa && (
        <section className={estilos.texto} id="comparacao">
          {/* O número sai do panorama, nunca cravado: o Distrito Federal fica
              de fora (não entrega como município, ver `PRESTA_COMO_ESTADO`),
              então são 26 e não 27. Escrever "27" aqui seria a mesma mentira
              silenciosa que a mediana regional cravada já custou. */}
          <h2>
            {r.uf.nome} e {br(panorama.length - 1)} outras unidades da federação
          </h2>

          <h3 className={estilos.subtitulo}>Quantos prestam contas</h3>
          <p>
            <strong>{br(meu.publicaram)}</strong> dos{" "}
            <strong>{br(meu.municipios)}</strong> municípios {de} entregaram o
            Relatório de Gestão Fiscal do {quadrimestre} —{" "}
            <strong>{br(meu.taxa, 0)}%</strong>. Entre as{" "}
            {br(panorama.length)} com relatório municipal,{" "}
            {posTaxa.abaixo === 0 ? (
              <>nenhum entrega menos</>
            ) : (
              <>
                <strong>
                  {br(posTaxa.abaixo)}{" "}
                  {posTaxa.abaixo === 1 ? "entrega" : "entregam"} menos
                </strong>
              </>
            )}
            .
          </p>
          <div className={estilos.grafico}>
            <TiraEstados
              panorama={panorama}
              destaque={r.uf.sigla}
              valorDe={(x) => x.taxa}
              formatar={(v) => `${br(v, 0)}%`}
              rotuloEixo="Percentual de municípios que entregaram o relatório fiscal, por estado"
              descricao={
                `As ${panorama.length} unidades da federação pelo percentual ` +
                `de municípios que entregaram o ` +
                `relatório fiscal. ${r.uf.nome} está em ${br(meu.taxa, 0)}%, ` +
                `acima de ${br(posTaxa.abaixo)} dos outros. O menor é ` +
                `${br(Math.min(...panorama.map((x) => x.taxa)), 0)}% e o maior ` +
                `${br(Math.max(...panorama.map((x) => x.taxa)), 0)}%.`
              }
            />
          </div>
          <p className={estilos.ressalva}>
            A entrega varia de{" "}
            <strong>
              {br(Math.min(...panorama.map((x) => x.taxa)), 0)}% a{" "}
              {br(Math.max(...panorama.map((x) => x.taxa)), 0)}%
            </strong>{" "}
            entre as unidades da federação, e{" "}
            <strong>não é uma divisão regional</strong>: Santa Catarina entrega
            86% e o Rio Grande do Sul 15%, vizinhos; a Bahia 99% e o Maranhão
            49%, ambos no Nordeste. Entregar é obrigação da Lei de
            Responsabilidade Fiscal, mas não entregar tem causas que este painel
            não conhece — aqui está o número, não o motivo.
          </p>

          {meu.mediana !== null && posMediana && (
            <>
              <h3 className={estilos.subtitulo}>Quanto se gasta com pessoal</h3>
              <p>
                A mediana {de} é <strong>{br(meu.mediana, 2)}%</strong> da
                receita corrente líquida ajustada, calculada sobre{" "}
                <strong>{br(meu.base)}</strong>{" "}
                {meu.base === 1 ? "município" : "municípios"}. Entre os{" "}
                {br(medianas.length)} com base suficiente,{" "}
                {posMediana.abaixo === 0 ? (
                  <>nenhum tem mediana menor</>
                ) : (
                  <strong>
                    {br(posMediana.abaixo)}{" "}
                    {posMediana.abaixo === 1 ? "tem" : "têm"} mediana menor
                  </strong>
                )}
                .
              </p>
              <div className={estilos.grafico}>
                <TiraEstados
                  panorama={panorama}
                  destaque={r.uf.sigla}
                  valorDe={(x) => x.mediana}
                  formatar={(v) => `${br(v, 1)}%`}
                  rotuloEixo="Mediana do gasto com pessoal, por estado"
                  descricao={
                    `As unidades da federação pela mediana do gasto com ` +
                    `pessoal. ` +
                    `${r.uf.nome} está em ${br(meu.mediana, 2)}%, acima de ` +
                    `${br(posMediana.abaixo)} das ${br(posMediana.de)} ` +
                    `com base suficiente.`
                  }
                />
              </div>
              <p className={estilos.ressalva}>
                {meu.taxa < 50 ? (
                  <>
                    <strong>Leia esta mediana com reserva.</strong> Ela descreve
                    os {br(meu.base)} municípios que entregaram — {br(meu.taxa, 0)}%
                    do estado. Sobre os outros não se sabe nada, e nada garante
                    que se pareçam com estes.
                  </>
                ) : (
                  <>
                    A mediana descreve os {br(meu.base)} municípios que
                    entregaram, não os {br(meu.municipios)} do estado. Sobre os
                    que não entregaram não se sabe nada.
                  </>
                )}
              </p>
            </>
          )}
        </section>
      )}

      <section className={estilos.texto} id="municipios">
        <h2>
          {r.uf.municipios === 1
            ? `O município ${de}`
            : `Os ${br(r.uf.municipios)} municípios ${de}`}
        </h2>
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
            <a href="/dados/municipios.xlsx" download>
              Base completa em planilha
            </a>{" "}
            <span className={estilos.fonte}>
              — os {br(snapshot.municipios.length)} municípios do país, com
              dicionário de colunas e procedência
            </span>
          </li>
          <li>
            <a href="/dados/municipios.csv" download>A mesma base em CSV</a>{" "}
            <span className={estilos.fonte}>— para ler por programa</span>
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
