import Link from "next/link";

import { br, expandir } from "../lib/dados";
import { slugUf } from "../lib/estado";
import { lerSnapshot } from "../lib/servidor";
import estilos from "./ajuda/ajuda.module.css";

/**
 * A página de endereço não encontrado.
 *
 * Existe porque o padrão do Next é **"404: This page could not be found."** —
 * em inglês, num site em português, sem nenhuma saída. Com 5.571 páginas de
 * município, URL errada não é hipótese: é rotina. Vem de link antigo, de
 * endereço digitado à mão, de grafia sem acento.
 *
 * ## O que uma página de erro deve fazer, e a maioria não faz
 *
 * Dizer o que aconteceu **e oferecer o caminho**. Quem chega aqui queria um
 * município específico; mandá-lo para a capa sem explicação é fazê-lo procurar
 * de novo do zero. Os três caminhos abaixo cobrem as três razões reais de
 * alguém cair aqui: erro de grafia (a busca da capa), navegação por estado, e
 * dúvida sobre cobertura (a ajuda).
 *
 * ## Sem `generateStaticParams`, e sem número inventado
 *
 * Os totais vêm do snapshot como em qualquer outra página. Escrever "5.571" no
 * texto seria criar mais um número para envelhecer sozinho — o erro que a
 * expansão nacional já cobrou três vezes.
 */

export const metadata = {
  title: "Endereço não encontrado — Números Públicos",
  description:
    "Este endereço não existe no Números Públicos. A busca da capa encontra " +
    "qualquer um dos municípios cobertos.",
  robots: { index: false, follow: true },
};

export default async function NaoEncontrado() {
  const snapshot = await lerSnapshot();
  const total = expandir(snapshot).length;

  return (
    <main className={estilos.pagina} id="conteudo">
      <header>
        <h1 className={estilos.titulo}>Este endereço não existe</h1>
        <p className={estilos.chamada}>
          O caminho que você abriu não corresponde a nenhuma página deste site.
          Costuma ser grafia diferente da que o IBGE usa — <em>Santana</em> por{" "}
          <em>Sant&rsquo;Ana</em>, ou um acento a menos.
        </p>
      </header>

      <section className={estilos.bloco}>
        <h2>Três caminhos daqui</h2>
        <ul className={estilos.lista}>
          <li>
            <Link href="/" prefetch={false}>
              <strong>Buscar na capa</strong>
            </Link>{" "}
            — a lista dos {br(total)} municípios tem busca por nome e filtro por
            estado. É o caminho mais rápido quando você sabe o nome.
          </li>
          <li>
            <strong>Ir pelo estado</strong> — cada um lista todos os seus
            municípios, em ordem alfabética:{" "}
            {snapshot.ufs.map((u, i) => (
              <span key={u.sigla}>
                {i > 0 && " · "}
                <Link href={`/estado/${slugUf(u.sigla)}/`} prefetch={false}>
                  {u.sigla}
                </Link>
              </span>
            ))}
          </li>
          <li>
            <Link href="/ajuda/#faltando" prefetch={false}>
              <strong>Meu município não aparece</strong>
            </Link>{" "}
            — se ele existe e mesmo assim não está aqui, a ajuda explica os
            casos em que isso acontece.
          </li>
        </ul>
      </section>

      <footer className={estilos.rodape}>
        <p>
          Se você chegou por um link de dentro do site, ele está quebrado e
          queremos saber: abra uma questão no{" "}
          <a
            href="https://github.com/peterwkdev-creator/observatorio-ne/issues"
            rel="noopener"
          >
            repositório
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
