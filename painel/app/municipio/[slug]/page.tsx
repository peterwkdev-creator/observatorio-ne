import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { br, expandir } from "../../../lib/dados";
import {
  indexarFiscal, ROTULO_FAIXA, rotuloPeriodo, slugDe, variacao,
} from "../../../lib/fiscal";
import { lerFiscal, lerSnapshot, SITE } from "../../../lib/servidor";
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
  // A descrição carrega os NÚMEROS, não adjetivos. É o que aparece no
  // resultado da busca, e número é o que faz alguém clicar num painel de dado.
  const partes = [
    pop !== null ? `${br(pop, 0)} habitantes` : null,
    pessoal !== null ? `${br(pessoal, 2)}% da receita em pessoal` : null,
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
  const vizinhos = municipios
    .filter((x) => x.uf === m.uf && x.codigo !== m.codigo)
    .sort((a, b) =>
      (b.valores["populacao-censo-2022"] ?? 0) -
      (a.valores["populacao-censo-2022"] ?? 0))
    .slice(0, 12);

  // `?? null` porque o acesso indexado num Record pode devolver `undefined`
  // quando a coluna não existe no snapshot -- e `undefined` e `null` precisam
  // colapsar num único "não sei" antes de qualquer conta.
  const pib = m.valores["pib-municipal"] ?? null;
  const pop = m.valores["populacao-censo-2022"] ?? null;
  const estimada = m.valores["populacao-estimada"] ?? null;
  // O PIB vem em MIL reais no agregado do IBGE; per capita em reais inteiros.
  const perCapita = pib !== null && pop !== null && pop ? (pib * 1000) / pop : null;

  const f = m.fiscal;
  const quadrimestre = `${fiscal.periodo}º quadrimestre de ${fiscal.exercicio}`;
  const serie = fiscal.serie[String(m.codigo)] ?? [];
  const delta = variacao(serie);

  // JSON-LD: é o que faz o Google entender que a página descreve um lugar e um
  // conjunto de dados, em vez de tratá-la como texto solto.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `Dados abertos de ${m.nome} (${m.uf})`,
    description:
      `População, PIB e despesa com pessoal do município de ${m.nome}, ` +
      `${m.uf}, a partir das APIs públicas do IBGE e do SICONFI.`,
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
        <span>{uf?.nome ?? m.uf}</span>
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
          <p className={`${estilos.valor} tabular`}>
            {pib === null ? "—" : `R$ ${br(pib, 0)} mil`}
          </p>
          <p className={estilos.fonte}>A preços correntes · IBGE</p>
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
            {quadrimestre} — mais do que <em>toda</em> a receita do município.
            Isso não descreve uma prefeitura em crise: descreve um formulário
            preenchido errado. Em reais, o relatório traz R$ {br(f.despesa, 2)}{" "}
            de despesa sobre R$ {br(f.rclAjustada, 2)} de receita.
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
            {f.despesa !== null && f.rclAjustada !== null && (
              <>
                {" "}Em reais: R$ {br(f.despesa, 2)} de despesa sobre R${" "}
                {br(f.rclAjustada, 2)} de receita.
              </>
            )}
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
          mostra o número publicado ao lado do limite legal.
        </p>
      </section>

      {serie.length > 1 && (
        <section className={estilos.texto}>
          <h2>Como isso mudou ao longo do tempo</h2>
          <p>
            {delta === null ? null : delta > 0 ? (
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
          <div className={estilos.rolagem}>
            <table className={estilos.serie}>
              <thead>
                <tr>
                  <th scope="col">Quadrimestre</th>
                  <th scope="col" className={estilos.num}>Pessoal / RCL</th>
                </tr>
              </thead>
              <tbody>
                {serie.map(([ex, pe, , pct]) => (
                  <tr key={`${ex}-${pe}`}>
                    <th scope="row">{rotuloPeriodo(ex, pe)}</th>
                    <td className={`${estilos.num} tabular`}>{br(pct, 2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={estilos.ressalva}>
            Quadrimestre sem linha é quadrimestre em que o município{" "}
            <strong>não entregou</strong> o relatório — não zero, e não
            estabilidade.
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
            <Link href="/">Ver os {snapshot.municipios.length} municípios do
            Nordeste</Link>
          </p>
        </section>
      )}

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
