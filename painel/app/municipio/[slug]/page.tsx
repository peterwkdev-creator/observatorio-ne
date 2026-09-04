import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { br, descricaoDe, escala, expandir, milReaisParaReais } from "../../../lib/dados";
import { slugUf, vizinhosDe } from "../../../lib/estado";
import { posicaoEntre, posicaoNoEstado } from "../../../lib/posicao";
import {
  FONTES, VARIAVEIS, coberturaTemporal, idCatalogo, identificadorIbge, palavrasChave,
} from "../../../lib/jsonld";
import {
  compararFuncoes, DESLOCAMENTO_MINIMO, FUNCOES_DA_PORTARIA, funcoesDe,
  indexarFiscal, ROTULO_FAIXA, rotuloPeriodo, slugDe, variacao,
} from "../../../lib/fiscal";
import { contarMetas, medianaGeral, trajetoriaDe } from "../../../lib/ideb";
import { lerFiscal, lerIdeb, lerSnapshot, SITE } from "../../../lib/servidor";
import FuncoesBarras from "../../componentes/funcoes-barras";
import DistribuicaoSvg from "../../componentes/distribuicao-svg";
import IdebSvg from "../../componentes/ideb-svg";
import Termo from "../../componentes/termo";
import SerieSvg from "./serie-svg";
import estilos from "./municipio.module.css";

/**
 * Uma página por município — 5.571 delas, geradas no build.
 *
 * Existe por uma razão medida: o site inteiro tinha **uma** URL indexável, com
 * todos os municípios de dado dentro. Quem procura "gasto com pessoal prefeitura
 * de Imperatriz" nunca ia chegar a uma tabela que exige rolar e filtrar. Cada
 * município agora tem endereço próprio, título próprio e o dado dos dois
 * sistemas junto — que é o que nenhuma das duas fontes originais oferece.
 */

async function carregar() {
  const [snapshot, fiscal, ideb, idebFinais] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerIdeb("anos_finais"),
  ]);
  const porCodigo = indexarFiscal(fiscal);
  const municipios = expandir(snapshot).map((m) => ({
    ...m,
    slug: slugDe(m.nome, m.uf),
    fiscal: porCodigo.get(m.codigo) ?? null,
  }));
  return { snapshot, fiscal, ideb, idebFinais, municipios };
}

export async function generateStaticParams() {
  const { municipios } = await carregar();
  return municipios.map((m) => ({ slug: m.slug }));
}


/**
 * O `<title>`, dentro do que o Google mostra.
 *
 * O buscador corta perto de **60 caracteres**, e nomes brasileiros de município
 * chegam longe: "Boa Esperança do Norte" com o sufixo completo dava 64, e o
 * resultado apareceria truncado justamente no que diferencia a página.
 *
 * A escolha é encurtar o SUFIXO, nunca o nome: o nome é o que a pessoa digitou
 * na busca, e é ele que precisa aparecer inteiro. Três variantes, da mais
 * informativa para a mais curta, e a primeira que couber vence.
 */
function tituloDe(nome: string, uf: string): string {
  const base = `${nome} (${uf})`;
  for (const sufixo of [
    " — população, PIB e gasto com pessoal",
    " — população, PIB e dados fiscais",
    " — dados abertos do município",
    " — dados abertos",
  ]) {
    if ((base + sufixo).length <= 60) return base + sufixo;
  }
  return base;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const { municipios, fiscal, ideb } = await carregar();
  const m = municipios.find((x) => x.slug === slug);
  if (!m) return {};

  const pop = m.valores["populacao-censo-2022"] ?? null;
  const pessoal = m.fiscal?.percentual ?? null;
  const maiorFuncao = funcoesDe(fiscal, m.codigo)?.fatias[0] ?? null;
  const ultimoIdeb = trajetoriaDe(ideb, m.codigo)?.ultimo.observado ?? null;
  // A descrição carrega os NÚMEROS, não adjetivos. É o que aparece no
  // resultado da busca, e número é o que faz alguém clicar num painel de dado.
  const partes = [
    pop !== null ? `${br(pop, 0)} habitantes` : null,
    pessoal !== null ? `${br(pessoal, 2)}% da receita em pessoal` : null,
    // A maior função é o número mais concreto da página inteira, e o único
    // que responde à pergunta que a pessoa realmente digitou na busca.
    maiorFuncao && maiorFuncao.percentual !== null
      ? `${br(maiorFuncao.percentual, 1)}% do gasto em ${maiorFuncao.nome.toLowerCase()}`
      : null,
    // "IDEB de <cidade>" é consulta com ciclo próprio, todo ano de divulgação.
    ultimoIdeb !== null ? `IDEB ${br(ultimoIdeb, 1)}` : null,
  ].filter(Boolean);

  // **A descrição cabe em ~155 caracteres, e o corte não é estético.** O Google
  // trunca a partir daí, então tudo depois disso é peso sem efeito. E o que
  // estava na cauda era a frase de procedência -- idêntica nas 1.794 páginas,
  // ou seja, o pedaço com MENOS valor de diferenciação ocupando o espaço do
  // que mais tem: os números deste município.
  const descricao = descricaoDe(
    `${m.nome} (${m.uf}): ${partes.join(", ")}.`,
    "Dados oficiais do IBGE, do Tesouro Nacional e do INEP.",
  );

  return {
    title: tituloDe(m.nome, m.uf),
    description: descricao,
    alternates: { canonical: `${SITE}/municipio/${m.slug}/` },
    openGraph: {
      title: `${m.nome} (${m.uf}) — dados abertos`,
      description: partes.join(" · ") || `Dados abertos de ${m.nome}/${m.uf}.`,
      url: `${SITE}/municipio/${m.slug}/`,
      locale: "pt_BR",
      type: "article",
    },
  };
}

/**
 * "do Maranhão", "da Bahia", "de Alagoas".
 *
 * Sem regra possível: é o artigo que cada nome carrega. A tabela completa mora
 * em `app/estado/[uf]/page.tsx`; aqui basta o caso geral e as exceções que
 * denunciariam texto gerado.
 */
const ARTIGO: Record<string, string> = {
  Alagoas: "de", Goiás: "de", Sergipe: "de", Roraima: "de", Rondônia: "de",
  Pernambuco: "de", "Mato Grosso": "de", "Mato Grosso do Sul": "de",
  "Minas Gerais": "de", "São Paulo": "de", "Santa Catarina": "de",
  "Espírito Santo": "do", Bahia: "da", Paraíba: "da",
};
function de(estado: string): string {
  const a = ARTIGO[estado];
  if (a) return `${a} ${estado}`;
  // O padrão é masculino: Maranhão, Ceará, Piauí, Paraná, Acre, Amazonas...
  return `do ${estado}`;
}

export default async function PaginaMunicipio(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { snapshot, fiscal, ideb, idebFinais, municipios } = await carregar();
  const m = municipios.find((x) => x.slug === slug);
  if (!m) notFound();

  const uf = snapshot.ufs.find((u) => u.sigla === m.uf);
  // **Vizinhos na ordem alfabética do estado, não os 12 maiores.** A versão
  // anterior mandava toda página do Maranhão para os mesmos 12 municípios, e a
  // medição de 03/09/2026 mostrou o resultado: 1.677 das 1.794 páginas (93%)
  // sem nenhum link interno entrando, enquanto Salvador recebia 416. Uma janela
  // que anda com o município espalha os links pelo estado inteiro.
  const doEstado = municipios
    .filter((x) => x.uf === m.uf)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const vizinhos = vizinhosDe(doEstado, m.codigo);

  // `?? null` porque o acesso indexado num Record pode devolver `undefined`
  // quando a coluna não existe no snapshot -- e `undefined` e `null` precisam
  // colapsar num único "não sei" antes de qualquer conta.
  const pib = m.valores["pib-municipal"] ?? null;
  const pop = m.valores["populacao-censo-2022"] ?? null;
  const estimada = m.valores["populacao-estimada"] ?? null;
  // O PIB vem em MIL reais no agregado do IBGE; per capita em reais inteiros.
  const pibReais = milReaisParaReais(pib);
  const perCapita = pibReais !== null && pop !== null && pop ? pibReais / pop : null;

  // Onde este município cai entre os do estado. Vai em TODAS as páginas: se o
  // contexto vale numa página curta, vale numa longa — e acrescentar só onde
  // falta texto seria engordar para o buscador. Ver `posicaoNoEstado`.
  const posPop = posicaoNoEstado(
    pop, doEstado.map((x) => x.valores["populacao-censo-2022"] ?? null));
  const posPerCapita = posicaoNoEstado(
    perCapita,
    doEstado.map((x) => {
      const p = milReaisParaReais(x.valores["pib-municipal"] ?? null);
      const q = x.valores["populacao-censo-2022"] ?? null;
      return p !== null && q ? p / q : null;
    }),
  );
  // Quantos municípios do estado também não entregaram. Só faz sentido na
  // página de quem não entregou: ali transforma um vazio isolado num padrão.
  const naoEntregaramNoEstado = doEstado.filter(
    (x) => x.fiscal && x.fiscal.publicou === false).length;
  const consultadosNoEstado = doEstado.filter(
    (x) => x.fiscal?.publicou !== null && x.fiscal?.publicou !== undefined).length;

  const f = m.fiscal;

  // Onde este município cai entre os do seu estado. Responde a pergunta que o
  // limite legal deixa intacta: "isso é muito?" -- um teto absoluto não diz se
  // o município é caso isolado ou se metade do estado está no mesmo lugar, e as
  // duas situações pedem leituras opostas da mesma porcentagem.
  const posicao = posicaoEntre(
    f?.percentual,
    municipios.filter((x) => x.uf === m.uf).map((x) => x.fiscal?.percentual),
  );

  const quadrimestre = `${fiscal.periodo}º quadrimestre de ${fiscal.exercicio}`;
  const serie = fiscal.serie[String(m.codigo)] ?? [];
  const delta = variacao(serie);

  // A outra pergunta: para onde vai o dinheiro. `null` quando o município não
  // entregou o RREO -- que é um relatório diferente do RGF, entregue em outra
  // data, então quem tem um pode perfeitamente não ter o outro.
  const funcoes = funcoesDe(fiscal, m.codigo);
  const bimestre = fiscal.funcoes
    ? `${fiscal.funcoes.periodo}º bimestre de ${fiscal.funcoes.exercicio}`
    : "";
  const maior = funcoes?.fatias[0] ?? null;

  // As duas etapas ficam SEPARADAS de propósito. Anos iniciais e anos finais
  // têm provas e escalas diferentes, e juntá-las num número só repetiria o
  // erro do Tesouro Selic: grandezas distintas na mesma régua.
  const iniciais = trajetoriaDe(ideb, m.codigo);
  const finais = trajetoriaDe(idebFinais, m.codigo);
  // As medianas do conjunto, para situar este município. Calculadas do
  // snapshot: escritas à mão, elas viram mentira na primeira mudança de
  // universo -- e foi exatamente o que a expansão nacional revelou.
  const medianaIniciais = medianaGeral(ideb);
  const medianaFinais = medianaGeral(idebFinais);
  // A fatia da educação, para a justaposição. NÃO é uma explicação da nota:
  // são dois fatos que ninguém publica lado a lado, e é o leitor quem pensa.
  const educacao = funcoes?.fatias.find((f) => f.nome === "Educação") ?? null;

  // A mudança de composição entre o mesmo bimestre de dois anos. `null` quando
  // falta um dos anos ou quando o crescimento do total sai da faixa comparável
  // -- ali um dos dois relatórios está quebrado.
  const comparacao = compararFuncoes(fiscal, m.codigo);
  const mudancas = (comparacao?.deslocamentos ?? [])
    .filter((d) => Math.abs(d.pontos) >= DESLOCAMENTO_MINIMO)
    .slice(0, 5);

  // JSON-LD: é o que faz o Google entender que a página descreve um lugar e um
  // conjunto de dados, em vez de tratá-la como texto solto.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `Dados abertos de ${m.nome} (${m.uf})`,
    description:
      `População, PIB, despesa com pessoal e despesa liquidada por função ` +
      `orçamentária do município de ${m.nome}, ${m.uf}, a partir das APIs ` +
      `públicas do IBGE e do SICONFI/Tesouro Nacional.`,
    url: `${SITE}/municipio/${m.slug}/`,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    isAccessibleForFree: true,
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    // Os cinco campos que a auditoria de 03/09/2026 achou ausentes contra a
    // documentação do Google para `Dataset`. Nenhum é obrigatório -- e é por
    // isso que passavam: a página valida sem eles. O que eles decidem é se o
    // conjunto aparece DESCRITO no Google Dataset Search ou some no meio das
    // páginas de texto.
    identifier: identificadorIbge(m.codigo),
    keywords: palavrasChave([m.nome, uf?.nome ?? m.uf, "IDEB", "IBGE", "SICONFI"]),
    temporalCoverage: coberturaTemporal(snapshot, fiscal, ideb),
    variableMeasured: VARIAVEIS,
    includedInDataCatalog: { "@id": idCatalogo(SITE) },
    spatialCoverage: {
      "@type": "Place",
      name: `${m.nome}, ${m.uf}, Brasil`,
      identifier: String(m.codigo),
    },
    // `distribution` e o campo que separa "pagina que fala de dados" de
    // "dataset". Sem um arquivo baixavel apontado aqui, o schema.org/Dataset e
    // uma alegacao sem lastro -- e o Google trata como tal.
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE}/municipio/${m.slug}/dados.csv`,
        name: `Dados de ${m.nome} (${m.uf}) em CSV`,
      },
      {
        "@type": "DataDownload",
        encodingFormat:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contentUrl: `${SITE}/dados/municipios.xlsx`,
        name: "Base completa em planilha, com dicionário e procedência",
      },
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE}/dados/municipios.csv`,
        name: `Base completa: ${br(snapshot.municipios.length)} municípios`,
      },
    ],
    isBasedOn: FONTES,
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className={estilos.trilha} aria-label="Você está em">
        {/* `prefetch={false}` no link da capa. Medido em 03/09/2026: o Next
            pré-buscava o payload dela em TODA página — 269 KB, 32% do peso
            total — porque a capa embute os municípios da tabela interativa.
            Pré-busca é conveniência para quem navega dentro do site; quem chega
            de uma busca abre uma página e sai, e paga o download por nada. */}
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        {/* Era um `<span>`: a trilha prometia um nível que não existia. */}
        {/* `prefetch={false}` aqui também, e a razão cresceu com a expansão:
            a página de São Paulo tem 645 municípios listados e 649 KB de
            documento. Pré-buscá-la de cada uma das 645 páginas de município
            paulistas custava 200 KB por página, medidos, para uma navegação
            que quem chega de uma busca quase nunca faz. */}
        <Link href={`/estado/${slugUf(m.uf)}/`} prefetch={false}>
          {uf?.nome ?? m.uf}
        </Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{m.nome}</span>
      </nav>

      <header>
        <h1 className={estilos.titulo}>
          {m.nome} <span className={estilos.uf}>{m.uf}</span>
        </h1>
        <p className={estilos.chamada}>
          Código IBGE {m.codigo}. Todos os números abaixo vêm das APIs públicas
          do IBGE e do Tesouro Nacional, com a fonte e a data de coleta ao lado
          de cada um.
        </p>
      </header>

      <section className={estilos.grade} aria-label="Indicadores">
        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>População</h2>
          <p className={`${estilos.valor} tabular`}>
            {pop === null ? "—" : br(pop, 0)}
          </p>
          <p className={estilos.fonte}>Censo 2022 · IBGE</p>
          {estimada !== null && (
            <p className={estilos.fonte}>
              Estimativa mais recente: {br(estimada, 0)}
            </p>
          )}
        </article>

        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>PIB municipal</h2>
          <p className={`${estilos.valor} tabular`} title={escala(pibReais).exato}>
            {escala(pibReais).curto}
          </p>
          <p className={estilos.fonte}>
            A preços correntes · IBGE
            {pibReais !== null && (
              <>
                <br />
                {escala(pibReais).exato}
              </>
            )}
          </p>
        </article>

        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>PIB por habitante</h2>
          <p className={`${estilos.valor} tabular`}>
            {perCapita === null ? "—" : `R$ ${br(perCapita, 0)}`}
          </p>
          <p className={estilos.fonte}>
            calculado a partir do PIB e do Censo 2022
          </p>
        </article>

        <article className={`${estilos.cartao} ${estilos[f?.faixa ?? "nao-consultado"]}`}>
          <h2 className={estilos.rotulo}>Despesa com pessoal</h2>
          <p className={`${estilos.valor} tabular`}>
            {f?.percentual === null || f?.percentual === undefined
              ? "—"
              : `${br(f.percentual, 2)}%`}
          </p>
          <p className={estilos.selo}>
            {f?.faixa === "implausivel" ? (
              <Termo
                ancora="implausivel"
                bloco
                dica="O município declarou um percentual que nenhuma prefeitura pode ter — acima de 100% da receita, ou negativo. Não descreve uma crise: descreve um formulário preenchido errado. Fica exibido e marcado, e fora das médias."
              >
                {ROTULO_FAIXA.implausivel}
              </Termo>
            ) : f?.faixa === "sem-dado" ? (
              <Termo
                ancora="travessao"
                bloco
                dica="O município não entregou o relatório ao SICONFI. Isso não significa que gaste zero com pessoal: significa que o dado não existe na base do Tesouro."
              >
                {ROTULO_FAIXA["sem-dado"]}
              </Termo>
            ) : f?.faixa === "como-estado" ? (
              <Termo
                ancora="como-estado"
                bloco
                dica="Este ente presta contas como estado, e não como município: entrega o relatório na esfera estadual, onde de fato responde. O painel cobre municípios, e por isso não há número aqui — o que falta é o recorte, não a prestação de contas."
              >
                {ROTULO_FAIXA["como-estado"]}
              </Termo>
            ) : (
              ROTULO_FAIXA[f?.faixa ?? "nao-consultado"]
            )}
          </p>
          <p className={estilos.fonte}>
            da{" "}
            <Termo
              ancora="pessoal"
              bloco
              dica="A arrecadação do município menos as transferências que ele é obrigado a repassar, com os ajustes que a Lei de Responsabilidade Fiscal manda fazer. É o denominador do percentual — e é a ajustada, não a bruta."
            >
              receita corrente líquida ajustada
            </Termo>{" "}
            · {quadrimestre} · SICONFI
          </p>
        </article>
      </section>

      {/* Um número sozinho não responde a pergunta que a pessoa tem, que é se
          aquilo é grande ou pequeno. Esta seção põe a régua do estado ao lado —
          e vai em todas as páginas, não só nas curtas: contexto que só aparece
          onde falta texto é enchimento, e é o que a política de conteúdo em
          escala do Google chama de abuso. Ver `posicaoNoEstado`. */}
      {(posPop || posPerCapita) && uf && (
        <section className={estilos.texto}>
          <h2>{m.nome} no seu estado</h2>
          {posPop && (
            <p>
              Em população, {m.nome} tem <strong>mais habitantes que{" "}
              {br(posPop.abaixo)}</strong> dos <strong>{br(posPop.de)}</strong>{" "}
              municípios {de(uf.nome)} — a mediana do estado é{" "}
              <strong>{br(posPop.mediana, 0)}</strong> habitantes.
            </p>
          )}
          {posPerCapita && perCapita !== null && (
            <p>
              O PIB por habitante, <strong>R$ {br(perCapita, 0)}</strong>, fica{" "}
              <strong>
                {perCapita >= posPerCapita.mediana ? "acima" : "abaixo"}
              </strong>{" "}
              da mediana {de(uf.nome)}, que é{" "}
              <strong>R$ {br(posPerCapita.mediana, 0)}</strong>.
            </p>
          )}
          <p className={estilos.ressalva}>
            Municípios sem o valor na fonte <strong>ficam fora da conta</strong>,
            não no fim dela: não saber a população de um município não o torna o
            menor do estado. E isto <em>situa</em>, não classifica — população e
            PIB não são mérito, e o site não os apresenta como se fossem.
          </p>
        </section>
      )}

      <section className={estilos.texto}>
        <h2>O que o gasto com pessoal significa aqui</h2>
        {f?.faixa === "implausivel" ? (
          <p>
            {m.nome} declarou <strong>{br(f.percentual, 2)}%</strong> da sua
            receita corrente líquida ajustada comprometidos com pessoal no{" "}
            {quadrimestre} —{" "}
            {(f.percentual ?? 0) < 0
              ? "um gasto negativo com pessoal, que nenhuma prefeitura pode ter"
              : "mais do que toda a receita do município"}
            . Isso não descreve uma prefeitura em crise: descreve um formulário
            preenchido errado.
            {(f.despesa ?? 0) > 0 && (f.rclAjustada ?? 0) > 0 && (
              <>
                {" "}Em reais, o relatório traz {escala(f.despesa).curto} de
                despesa sobre {escala(f.rclAjustada).curto} de receita.
              </>
            )}
            <br />
            <br />
            O número acima é <strong>o que o município enviou ao SICONFI</strong>,
            conferido linha a linha contra a API. Este painel não o corrige —
            corrigir seria inventar um valor — mas também não o apresenta como se
            fosse verdade sobre o gasto real.
          </p>
        ) : f?.percentual !== null && f?.percentual !== undefined ? (
          <p>
            No {quadrimestre}, {m.nome} declarou{" "}
            <strong>{br(f.percentual, 2)}%</strong> da sua receita corrente líquida
            ajustada comprometidos com pessoal. A Lei de Responsabilidade Fiscal
            fixa <strong>{br(fiscal.limites.legal, 2)}%</strong> como teto para o
            Executivo municipal, e{" "}
            <strong>{br(f.limitePrudencial ?? fiscal.limites.prudencial, 2)}%</strong>{" "}
            como{" "}
            <Termo
              ancora="pessoal"
              dica="O patamar de alerta da Lei de Responsabilidade Fiscal, 95% do teto. Passar dele já proíbe criar cargo, conceder aumento e contratar — antes de o teto ser atingido."
            >
              limite prudencial
            </Termo>{" "}
            — passar dele já proíbe criar cargo, conceder aumento e contratar.
            {/* Guarda contra o relatorio inconsistente: Sao Bernardo/MA
                declarou receita AJUSTADA negativa (-R$ 208 mi) com percentual
                plausivel. Imprimir "sobre R$ -208.239.413,34 de receita"
                pareceria defeito do painel, e nao do relatorio. */}
            {(f.despesa ?? 0) > 0 && (f.rclAjustada ?? 0) > 0 ? (
              <>
                {" "}Em reais: <strong>{escala(f.despesa).curto}</strong> de
                despesa sobre <strong>{escala(f.rclAjustada).curto}</strong> de
                receita.
              </>
            ) : f.rclAjustada !== null && (f.rclAjustada ?? 0) <= 0 ? (
              <>
                {" "}Os valores em reais deste relatório são inconsistentes: a
                receita foi declarada como zero ou negativa, o que nenhum
                município pode ter. O percentual acima é o que foi publicado; os
                valores absolutos não são exibidos porque não descrevem nada.
              </>
            ) : null}
          </p>
        ) : f?.faixa === "como-estado" ? (
          // Não é ausência, e chamá-la assim é acusação sem lastro: o ente
          // entrega o Anexo 01 normalmente, na esfera em que presta contas.
          // Conferido na fonte em 04/09/2026. Ver `PRESTA_COMO_ESTADO`.
          <p>
            <strong>{m.nome} presta contas como estado</strong>, e não como
            município — o Distrito Federal não é um município, e por isso não
            entrega o Relatório de Gestão Fiscal na esfera municipal. Ele{" "}
            <strong>entrega o relatório</strong>, na esfera estadual, e este
            painel cobre municípios: por isso o número não aparece aqui.{" "}
            <em>Ausência de dado municipal não é ausência de prestação de
            contas.</em>
          </p>
        ) : f?.publicou === false ? (
          <>
            <p>
              <strong>{m.nome} não entregou</strong> o Relatório de Gestão Fiscal
              do {quadrimestre} ao SICONFI. Isso não significa que o município
              gaste zero com pessoal — significa que o dado <em>não existe</em> na
              base do Tesouro Nacional. Ausência não é número, e este painel não a
              converte em um.
            </p>
            {/* A ausência sozinha parece caso isolado; com o estado ao lado,
                vira padrão — e padrão é informação. Só entra na página de quem
                não entregou, porque é sobre esse fato específico. */}
            {naoEntregaramNoEstado > 1 && consultadosNoEstado > 0 && uf && (
              <p>
                Não é um caso isolado:{" "}
                <strong>{br(naoEntregaramNoEstado)}</strong> dos{" "}
                <strong>{br(consultadosNoEstado)}</strong> municípios{" "}
                {de(uf.nome)} consultados também não entregaram —{" "}
                <strong>
                  {br((naoEntregaramNoEstado * 100) / consultadosNoEstado, 0)}%
                </strong>
                . <Link href={`/estado/${slugUf(m.uf)}/#comparacao`} prefetch={false}>
                  Como {uf.nome} se compara ao país
                </Link>.
              </p>
            )}
          </>
        ) : (
          <p>
            O Relatório de Gestão Fiscal do {quadrimestre} deste município ainda
            não foi consultado nesta rodada de coleta.
          </p>
        )}
        <p className={estilos.ressalva}>
          O percentual <strong>não é recalculado aqui</strong>: ele vem
          calculado e declarado pelo próprio município. Este painel não
          interpreta, não acusa e não declara ninguém em descumprimento —
          mostra o número publicado ao lado do limite legal.{" "}
          <Link href="/ajuda/#pessoal">O que é RCL ajustada?</Link>
        </p>
      </section>

      {posicao && f?.percentual !== null && f?.percentual !== undefined && (
        <section className={estilos.texto}>
          <h2>Isso é muito?</h2>
          <p>
            O limite legal responde <em>se está dentro da lei</em>. Não responde
            se {m.nome} é um caso isolado ou se boa parte do estado está no
            mesmo lugar — e as duas situações pedem leituras opostas do mesmo
            número.
          </p>
          <p>
            Entre os <strong>{br(posicao.base)}</strong> municípios{" "}
            {de(uf?.nome ?? m.uf)} que entregaram o relatório com valor
            plausível, {m.nome} está{" "}
            <strong>
              acima de {br(posicao.percentil, 0)}%
            </strong>{" "}
            deles. A mediana do estado é{" "}
            <strong>{br(posicao.mediana, 2)}%</strong>.
          </p>

          <div className={estilos.grafico}>
            <DistribuicaoSvg
              posicao={posicao}
              percentual={f.percentual}
              prudencial={f.limitePrudencial ?? fiscal.limites.prudencial}
              legal={fiscal.limites.legal}
              municipio={m.nome}
              conjunto={de(uf?.nome ?? m.uf)}
            />
          </div>

          <p className={estilos.ressalva}>
            Entram na comparação apenas os que <strong>entregaram</strong> o
            relatório e cujo percentual está entre 0 e 100%. Quem não entregou
            não tem número — tratá-lo como zero o poria no fim da fila por não
            ter prestado contas, que é o inverso da verdade. E um município que
            declarou 371% empurraria todos os outros um degrau, por causa de um
            erro de preenchimento.
          </p>
        </section>
      )}

      {serie.length > 1 && (
        <section className={estilos.texto}>
          <h2>Como isso mudou ao longo do tempo</h2>
          <p>
            {delta === null ? (
              <>
                Não há dois quadrimestres com valor plausível o bastante para
                falar em tendência — a tabela abaixo mostra o que foi publicado.
              </>
            ) : delta > 0 ? (
              <>
                O comprometimento com pessoal <strong>subiu {br(delta, 2)} ponto
                {Math.abs(delta) >= 2 ? "s" : ""} percentua
                {Math.abs(delta) >= 2 ? "is" : "l"}</strong> entre o primeiro e o
                último quadrimestre publicado.
              </>
            ) : delta < 0 ? (
              <>
                O comprometimento com pessoal <strong>caiu {br(Math.abs(delta), 2)}{" "}
                ponto{Math.abs(delta) >= 2 ? "s" : ""} percentua
                {Math.abs(delta) >= 2 ? "is" : "l"}</strong> entre o primeiro e o
                último quadrimestre publicado.
              </>
            ) : (
              <>O comprometimento com pessoal ficou <strong>estável</strong>.</>
            )}{" "}
            Cada linha abaixo é um relatório entregue por {m.nome} ao SICONFI.
          </p>
          <div className={estilos.grafico}>
            <SerieSvg
              pontos={serie}
              prudencial={f?.limitePrudencial ?? fiscal.limites.prudencial}
              legal={fiscal.limites.legal}
              municipio={m.nome}
            />
          </div>

          <div className={estilos.rolagem}>
            <table className={estilos.serie}>
              <thead>
                <tr>
                  <th scope="col">Quadrimestre</th>
                  <th scope="col" className={estilos.num}>Pessoal / RCL</th>
                </tr>
              </thead>
              <tbody>
                {serie.map(([ex, pe, , pct]) => {
                  // Ponto implausivel na serie precisa da mesma marca que no
                  // cartao. Paripueira/AL declarou -19,35% em 2024/1: sem
                  // marca, a linha parece o melhor resultado da tabela.
                  const fora = pct < 0 || pct > 100;
                  return (
                    <tr key={`${ex}-${pe}`}>
                      <th scope="row">{rotuloPeriodo(ex, pe)}</th>
                      <td
                        className={`${estilos.num} tabular ${fora ? estilos.implausivel : ""}`}
                      >
                        {br(pct, 2)}%
                        {fora && (
                          <span className={estilos.marca}> implausível</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={estilos.ressalva}>
            Quadrimestre sem linha é quadrimestre em que o município{" "}
            <strong>não entregou</strong> o relatório — não zero, e não
            estabilidade.{" "}
            <Link href="/ajuda/#travessao">Por que aparece “—”?</Link>
          </p>
        </section>
      )}

      {funcoes && funcoes.fatias.length > 0 && (
        <section className={estilos.texto}>
          <h2>Para onde vai o dinheiro</h2>
          <p>
            No {bimestre}, {m.nome} liquidou{" "}
            <strong>{escala(funcoes.total).curto}</strong> de despesa
            {maior && maior.percentual !== null && (
              <>
                , e a maior fatia foi <strong>{maior.nome.toLowerCase()}</strong>,
                com <strong>{br(maior.percentual, 1)}%</strong> do total
              </>
            )}
            . Este é um relatório <em>diferente</em> do que traz o gasto com
            pessoal: o percentual acima responde se a folha cabe no limite, e a
            tabela abaixo responde no que o dinheiro foi gasto. Um não prevê o
            outro.
          </p>
          <div className={estilos.rolagem}>
            <FuncoesBarras
              fatias={funcoes.fatias}
              total={funcoes.total}
              municipio={m.nome}
            />
          </div>
          <p className={estilos.ressalva}>
            Despesa{" "}
            <Termo
              ancora="funcao"
              dica="O que de fato foi gasto: o serviço foi prestado ou o material entregue, e a prefeitura reconheceu a dívida. Diferente de dotação (o que foi orçado) e de empenhada (o dinheiro reservado)."
            >
              <strong>liquidada</strong>
            </Termo>{" "}
            até o bimestre — o que de fato foi gasto, não o que foi orçado nem o
            que foi empenhado. {m.nome}{" "}
            declarou gasto em <strong>{funcoes.fatias.length}</strong> das{" "}
            {FUNCOES_DA_PORTARIA} funções previstas na Portaria MOG 42/1999, e a
            soma delas fecha com o total que o próprio município declarou.
            Fonte: {fiscal.funcoes?.fonte}.{" "}
            <Link href="/ajuda/#funcao">O que é despesa liquidada?</Link>
          </p>
        </section>
      )}

      {comparacao && (
        <section className={estilos.texto}>
          <h2>O que mudou de {comparacao.exercicioAnterior} para{" "}
            {comparacao.exercicioAtual}</h2>
          <p>
            Entre o {comparacao.periodo}º bimestre de{" "}
            {comparacao.exercicioAnterior} e o mesmo bimestre de{" "}
            {comparacao.exercicioAtual}, o gasto total de {m.nome}{" "}
            {comparacao.crescimento >= 1 ? "cresceu" : "caiu"}{" "}
            <strong>
              {br(Math.abs(comparacao.crescimento - 1) * 100, 1)}%
            </strong>{" "}
            em valores nominais.{" "}
            {mudancas.length === 0 ? (
              <>
                A <strong>composição</strong> do gasto, porém, ficou
                praticamente igual: nenhuma função mudou de fatia em mais de{" "}
                {br(DESLOCAMENTO_MINIMO, 1)} ponto percentual.
              </>
            ) : (
              <>
                E a <strong>composição</strong> mudou: abaixo, as funções cujo
                peso no orçamento se deslocou mais de{" "}
                {br(DESLOCAMENTO_MINIMO, 1)} ponto percentual.
              </>
            )}
          </p>

          {mudancas.length > 0 && (
            <ul className={estilos.mudancas}>
              {mudancas.map((d) => (
                <li key={d.nome} className={d.pontos > 0 ? estilos.subiu : estilos.caiu}>
                  <strong>{d.nome}</strong>{" "}
                  <span className="tabular">
                    {br(d.anterior, 1)}% → {br(d.atual, 1)}%
                  </span>{" "}
                  <span className={estilos.pontos}>
                    {d.pontos > 0 ? "+" : "−"}
                    {br(Math.abs(d.pontos), 1)} pp
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className={estilos.ressalva}>
            A comparação é entre o <strong>mesmo bimestre</strong> de dois anos,
            e não entre bimestres do mesmo ano — o RREO é acumulado, então o 6º
            bimestre já contém o 4º e comparar os dois mediria quase nada. Os
            valores são <strong>nominais</strong>: parte do crescimento é
            inflação, e este painel não deflaciona nada.{" "}
            <Link href="/ajuda/#comparacao">Por quê?</Link>
          </p>
        </section>
      )}

      {/* Sem IDEB, a seção inteira sumia e a página não dizia por quê — a
          pessoa não sabia se faltava coleta, se o município era pequeno demais
          ou se havia outro motivo. Ausência sem explicação é a mesma falha que
          "não entregou o relatório" tem, uma casa adiante.

          **O motivo foi verificado, não suposto.** Reingerindo o arquivo do
          INEP com `--rede Estadual` em 04/09/2026: dos 138 municípios sem rede
          municipal nos anos iniciais, **133 aparecem com rede estadual**. Os
          outros 5 (RS 3, MT 1, SC 1) não aparecem em nenhuma das duas, e sobre
          eles não se sabe — por isso o texto diz "quase sempre" e não afirma o
          caso específico. */}
      {!iniciais && (
        <section className={estilos.texto}>
          <h2>Educação</h2>
          <p>
            O INEP publica o IDEB <strong>por rede</strong>, e não há rede
            municipal de anos iniciais em {m.nome} no dado de{" "}
            {ideb.edicoes[ideb.edicoes.length - 1]}. Quem administra essas
            escolas é outra rede — <strong>quase sempre a estadual</strong>.
          </p>
          <p className={estilos.ressalva}>
            <strong>Isto não é lacuna da coleta.</strong> É como a educação
            básica está dividida ali, e acontece em{" "}
            <strong>{br(snapshot.municipios.length - ideb.cobertura.municipios)}</strong>{" "}
            dos {br(snapshot.municipios.length)} municípios do país,
            concentrados no Sul e no Sudeste. O gasto do município com educação
            continua acima, porque ele existe mesmo onde a rede é de outro ente.
          </p>
        </section>
      )}

      {iniciais && (
        <section className={estilos.texto}>
          <h2>Educação: o que o dinheiro encontrou pela frente</h2>
          <p>
            {educacao && educacao.percentual !== null ? (
              <>
                {m.nome} destinou{" "}
                <strong>{br(educacao.percentual, 1)}%</strong> do orçamento à
                educação no {bimestre}. O{" "}
                <Termo
                  ancora="ideb"
                  dica="O índice do INEP que combina o quanto os alunos aprenderam (prova do SAEB) com quantos avançaram de ano sem reprovar ou abandonar. Vai de 0 a 10, na mesma escala para todo município do país."
                >
                  IDEB
                </Termo>{" "}
                mede o outro lado da mesma conta: aprendizado e fluxo escolar,
                numa escala de 0 a 10.
              </>
            ) : (
              <>
                O IDEB mede aprendizado e fluxo escolar numa escala de 0 a 10,
                por rede e por etapa.
              </>
            )}{" "}
            Abaixo, a <strong>rede municipal</strong> nos{" "}
            {iniciais.rotuloEtapa} — a que a prefeitura administra e financia.
          </p>

          <h3 className={estilos.subtitulo}>
            Nos {iniciais.rotuloEtapa}
          </h3>

          <div className={estilos.grafico}>
            <IdebSvg trajetoria={iniciais} municipio={m.nome} />
          </div>

          <p>
            De <strong>{br(iniciais.primeiro.observado, 1)}</strong> em{" "}
            {iniciais.primeiro.edicao} para{" "}
            <strong>{br(iniciais.ultimo.observado, 1)}</strong> em{" "}
            {iniciais.ultimo.edicao}
            {iniciais.variacao !== 0 && (
              <>
                {" "}— {iniciais.variacao > 0 ? "alta" : "queda"} de{" "}
                {br(Math.abs(iniciais.variacao), 1)} ponto
                {Math.abs(iniciais.variacao) >= 2 ? "s" : ""}
              </>
            )}
            .{" "}
            {contarMetas(iniciais).comMeta > 0 && (
              <>
                O município bateu a meta do INEP em{" "}
                <strong>
                  {contarMetas(iniciais).bateu} das{" "}
                  {contarMetas(iniciais).comMeta}
                </strong>{" "}
                edições que tiveram meta.
              </>
            )}
          </p>

          <div className={estilos.rolagem}>
            <table className={estilos.serie}>
              <caption className={estilos.legenda}>
                IDEB da rede municipal de {m.nome}, {iniciais.rotuloEtapa}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Edição</th>
                  <th scope="col" className={estilos.num}>IDEB</th>
                  <th scope="col" className={estilos.num}>Meta</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {iniciais.pontos.map((p) => (
                  <tr key={p.edicao}>
                    <th scope="row">{p.edicao}</th>
                    <td className={`${estilos.num} tabular`}>
                      {br(p.observado, 1)}
                    </td>
                    <td className={`${estilos.num} tabular`}>
                      {p.projecao === null ? "—" : br(p.projecao, 1)}
                    </td>
                    <td>
                      {p.bateuMeta === null
                        ? "sem meta"
                        : p.bateuMeta
                          ? "atingiu a meta"
                          : "abaixo da meta"}
                      {p.ressalva && (
                        <>
                          {" "}
                          <span className={estilos.marca} title={p.ressalva}>
                            com ressalva do INEP
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {finais && (
            <>
              <h3 className={estilos.subtitulo}>
                E nos {finais.rotuloEtapa}
              </h3>
              <p>
                A mesma rede saiu de{" "}
                <strong>{br(finais.primeiro.observado, 1)}</strong> em{" "}
                {finais.primeiro.edicao} para{" "}
                <strong>{br(finais.ultimo.observado, 1)}</strong> em{" "}
                {finais.ultimo.edicao}
                {finais.variacao !== 0 && (
                  <>
                    {" "}— {finais.variacao > 0 ? "alta" : "queda"} de{" "}
                    {br(Math.abs(finais.variacao), 1)} ponto
                    {Math.abs(finais.variacao) >= 2 ? "s" : ""}
                  </>
                )}
                .{" "}
                {contarMetas(finais).comMeta > 0 && (
                  <>
                    Bateu a meta em{" "}
                    <strong>
                      {contarMetas(finais).bateu} das{" "}
                      {contarMetas(finais).comMeta}
                    </strong>{" "}
                    edições que tiveram meta.
                  </>
                )}
              </p>

              {/* Gráfico SEPARADO, e não uma segunda linha no gráfico de cima.
                  As duas etapas têm provas e escalas próprias, e as
                  medianas dos dois conjuntos ficam a mais de um ponto de
                  distância -- diferença de instrumento, não de desempenho. Duas
                  linhas no mesmo eixo convidariam exatamente a leitura errada
                  -- "os anos finais são piores" --, que é a mesma classe do
                  erro do Tesouro Selic: grandezas diferentes na mesma régua.

                  O eixo fixo de 0 a 10 é o que permite comparar os dois
                  gráficos com honestidade: cada um contra a sua própria meta,
                  na mesma escala do índice. */}
              <div className={estilos.grafico}>
                <IdebSvg trajetoria={finais} municipio={m.nome} />
              </div>

              <p className={estilos.ressalva}>
                As duas etapas <strong>não se comparam entre si</strong> — têm
                provas e escalas próprias, e por isso aparecem em gráficos
                separados.
                {medianaIniciais && medianaFinais && (
                  <>
                    {" "}Entre os municípios cobertos, a mediana de{" "}
                    {medianaIniciais.edicao} é{" "}
                    <strong>{br(medianaIniciais.mediana, 1)}</strong> nos anos
                    iniciais e <strong>{br(medianaFinais.mediana, 1)}</strong>{" "}
                    nos finais: a diferença é do instrumento, não um veredito
                    sobre os alunos mais velhos.
                  </>
                )}
              </p>
            </>
          )}


          {ideb.edicoesSemMeta.length > 0 && (
            <p className={estilos.ressalva}>
              <strong>Sem meta</strong> em {ideb.edicoesSemMeta.join(" e ")}{" "}
              porque o INEP não publicou uma: 2005 é a linha de base, e o
              primeiro ciclo do IDEB encerrou em 2021, com as novas metas ainda
              em definição (Portaria MEC 26/2024). Travessão aqui é ausência de
              alvo, não alvo não atingido.
            </p>
          )}

          <p className={estilos.ressalva}>
            Gasto e nota estão lado a lado porque{" "}
            <strong>nenhuma das duas fontes os publica juntos</strong> — não
            porque um explique o outro. Quanto um município gasta e o que os
            seus alunos aprendem dependem de muita coisa que não está nesta
            página. Fonte: {ideb.fonte}
            {ideb.coletadoEm ? `, coletado em ${ideb.coletadoEm.slice(0, 10)}` : ""}.{" "}
            <Link href="/ajuda/#ideb">O que é o IDEB?</Link>
          </p>
        </section>
      )}

      {vizinhos.length > 0 && (
        <section className={estilos.texto}>
          <h2>Outros municípios de {uf?.nome ?? m.uf}</h2>
          <ul className={estilos.vizinhos}>
            {vizinhos.map((v) => (
              <li key={v.codigo}>
                {/* Sem pré-busca automática. Medido em 03/09/2026: numa
                    página curta, os doze vizinhos cabem na primeira tela e o
                    Next pré-buscava quatro deles — 186 KB antes de qualquer
                    clique. `prefetch={false}` no App Router não desliga a
                    pré-busca ao passar o mouse; desliga só a especulativa.
                    Quem demonstra intenção continua ganhando o adiantamento. */}
                <Link href={`/municipio/${v.slug}/`} prefetch={false}>
                  {v.nome}
                </Link>
              </li>
            ))}
          </ul>
          <p>
            <Link href={`/estado/${slugUf(m.uf)}/`} prefetch={false}>
              Ver os {br(uf?.municipios ?? 0)} municípios de{" "}
              {uf?.nome ?? m.uf}
            </Link>{" "}
            ·{" "}
            <Link href="/" prefetch={false}>
              os {br(snapshot.municipios.length)} do país
            </Link>
          </p>
        </section>
      )}

      <section className={estilos.texto}>
        <h2>Baixar estes dados</h2>
        <p>
          Todo número desta página pode ser baixado e conferido. Um painel de
          dado público que só deixa <em>olhar</em> está pela metade — número que
          ninguém consegue baixar é número que ninguém consegue contestar.
        </p>
        <ul className={estilos.downloads}>
          <li>
            <a href={`/municipio/${m.slug}/dados.csv`} download>
              {m.nome} em CSV
            </a>{" "}
            <span className={estilos.fonte}>
              — só este município, uma linha por indicador e período
            </span>
          </li>
          <li>
            <a href="/dados/municipios.xlsx" download>
              Base completa em planilha
            </a>{" "}
            <span className={estilos.fonte}>
              — os {snapshot.municipios.length} municípios, com dicionário de
              colunas e procedência em abas separadas
            </span>
          </li>
          <li>
            <a href="/dados/municipios.csv" download>A mesma base em CSV</a>{" "}
            <span className={estilos.fonte}>— para ler por programa</span>
          </li>
        </ul>
        <p className={estilos.ressalva}>
          Separador <strong>ponto e vírgula</strong> e decimal com{" "}
          <strong>vírgula</strong>, como o Excel em português espera. Municípios
          que não entregaram o relatório aparecem como{" "}
          <code>nao</code> na coluna de publicação — nunca como zero.
        </p>
      </section>

      <footer className={estilos.rodape}>
        <p>
          Fontes: {snapshot.fonte} e {fiscal.fonte}
          {fiscal.coletadoEm ? ` · coleta fiscal em ${fiscal.coletadoEm.slice(0, 10)}` : ""}.
          Dados abertos, sob licença AGPL-3.0.
        </p>
      </footer>
    </main>
  );
}
