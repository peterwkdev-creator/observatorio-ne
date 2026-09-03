import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { br, escala, expandir, milReaisParaReais } from "../../../lib/dados";
import { slugUf, vizinhosDe } from "../../../lib/estado";
import {
  compararFuncoes, DESLOCAMENTO_MINIMO, FUNCOES_DA_PORTARIA, funcoesDe,
  indexarFiscal, ROTULO_FAIXA, rotuloPeriodo, slugDe, variacao,
} from "../../../lib/fiscal";
import { lerFiscal, lerSnapshot, SITE } from "../../../lib/servidor";
import FuncoesBarras from "../../componentes/funcoes-barras";
import SerieSvg from "./serie-svg";
import estilos from "./municipio.module.css";

/**
 * Uma página por município — 1.794 delas, geradas no build.
 *
 * Existe por uma razão medida: o site inteiro tinha **uma** URL indexável, com
 * 1.794 municípios de dado dentro. Quem procura "gasto com pessoal prefeitura
 * de Imperatriz" nunca ia chegar a uma tabela que exige rolar e filtrar. Cada
 * município agora tem endereço próprio, título próprio e o dado dos dois
 * sistemas junto — que é o que nenhuma das duas fontes originais oferece.
 */

async function carregar() {
  const [snapshot, fiscal] = await Promise.all([lerSnapshot(), lerFiscal()]);
  const porCodigo = indexarFiscal(fiscal);
  const municipios = expandir(snapshot).map((m) => ({
    ...m,
    slug: slugDe(m.nome, m.uf),
    fiscal: porCodigo.get(m.codigo) ?? null,
  }));
  return { snapshot, fiscal, municipios };
}

export async function generateStaticParams() {
  const { municipios } = await carregar();
  return municipios.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const { municipios, fiscal } = await carregar();
  const m = municipios.find((x) => x.slug === slug);
  if (!m) return {};

  const pop = m.valores["populacao-censo-2022"] ?? null;
  const pessoal = m.fiscal?.percentual ?? null;
  const maiorFuncao = funcoesDe(fiscal, m.codigo)?.fatias[0] ?? null;
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
  ].filter(Boolean);

  return {
    title: `${m.nome} (${m.uf}) — população, PIB e gasto com pessoal`,
    description:
      `Dados abertos de ${m.nome}/${m.uf}` +
      (partes.length ? `: ${partes.join(", ")}` : "") +
      `. Fonte: IBGE e SICONFI/Tesouro Nacional, com a data de coleta ao lado ` +
      `de cada número.`,
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

export default async function PaginaMunicipio(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { snapshot, fiscal, municipios } = await carregar();
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

  const f = m.fiscal;
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
        encodingFormat: "text/csv",
        contentUrl: `${SITE}/dados/municipios.csv`,
        name: "Base completa: 1.794 municípios do Nordeste",
      },
    ],
    isBasedOn: [
      { "@type": "Dataset", name: "IBGE — Agregados", url: "https://servicodados.ibge.gov.br" },
      { "@type": "Dataset", name: "SICONFI — Tesouro Nacional", url: "https://apidatalake.tesouro.gov.br" },
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
        {/* Era um `<span>`: a trilha prometia um nível que não existia. */}
        <Link href={`/estado/${slugUf(m.uf)}/`}>{uf?.nome ?? m.uf}</Link>
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

        <article className={`${estilos.cartao} ${estilos[f?.faixa ?? "sem-dado"]}`}>
          <h2 className={estilos.rotulo}>Despesa com pessoal</h2>
          <p className={`${estilos.valor} tabular`}>
            {f?.percentual === null || f?.percentual === undefined
              ? "—"
              : `${br(f.percentual, 2)}%`}
          </p>
          <p className={estilos.selo}>
            {ROTULO_FAIXA[f?.faixa ?? "sem-dado"]}
          </p>
          <p className={estilos.fonte}>
            da receita corrente líquida ajustada · {quadrimestre} · SICONFI
          </p>
        </article>
      </section>

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
            como limite prudencial — passar dele já proíbe criar cargo, conceder
            aumento e contratar.
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
        ) : f?.publicou === false ? (
          <p>
            <strong>{m.nome} não entregou</strong> o Relatório de Gestão Fiscal
            do {quadrimestre} ao SICONFI. Isso não significa que o município
            gaste zero com pessoal — significa que o dado <em>não existe</em> na
            base do Tesouro Nacional. Ausência não é número, e este painel não a
            converte em um.
          </p>
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
            Despesa <strong>liquidada</strong> até o bimestre — o que de fato
            foi gasto, não o que foi orçado nem o que foi empenhado. {m.nome}{" "}
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

      {vizinhos.length > 0 && (
        <section className={estilos.texto}>
          <h2>Outros municípios de {uf?.nome ?? m.uf}</h2>
          <ul className={estilos.vizinhos}>
            {vizinhos.map((v) => (
              <li key={v.codigo}>
                <Link href={`/municipio/${v.slug}/`}>{v.nome}</Link>
              </li>
            ))}
          </ul>
          <p>
            <Link href={`/estado/${slugUf(m.uf)}/`}>
              Ver os {br(uf?.municipios ?? 0)} municípios de{" "}
              {uf?.nome ?? m.uf}
            </Link>{" "}
            ·{" "}
            <Link href="/">
              os {br(snapshot.municipios.length)} do Nordeste
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
            <a href="/dados/municipios.csv" download>
              Base completa em CSV
            </a>{" "}
            <span className={estilos.fonte}>
              — os {snapshot.municipios.length} municípios, uma linha cada
            </span>
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
