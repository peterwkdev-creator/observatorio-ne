import type { Metadata } from "next";
import "./globals.css";
import BuscaCabecalho from "./componentes/busca-cabecalho";

export const metadata: Metadata = {
  title: "Números Públicos — dados abertos dos municípios brasileiros",
  // ~155 caracteres: o Google trunca a partir daí. O que sobrou é o que
  // diferencia este site de qualquer outro que cite as mesmas fontes.
  description:
    "População, PIB, gasto com pessoal, despesa por função e IDEB dos 5.571 " +
    "municípios do Brasil — cada número com a sua fonte e data de coleta.",
  metadataBase: new URL("https://www.numerospublicos.com.br"),
  openGraph: {
    title: "Números Públicos",
    description:
      "Dados abertos dos 5.571 municípios do Brasil, com procedência.",
    locale: "pt_BR",
    type: "website",
  },
  // `app/opengraph-image.png` vira o og:image sozinho, pela convenção de
  // arquivo do App Router. O `card` precisa ser explícito: o padrão do Next é
  // `summary`, que renderiza um quadrado pequeno e joga fora a imagem larga.
  // A imagem sai de `.claude/social-preview/` — regerar com `node
  // .claude/social-preview/gerar.mjs`, nunca editar o PNG à mão.
  twitter: {
    card: "summary_large_image",
    title: "Números Públicos",
    description:
      "Dados abertos dos 5.571 municípios do Brasil, com procedência.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {/* Primeiro elemento focável da página: quem navega por teclado não
            deveria passar por toda a navegação para chegar ao conteúdo. */}
        <a className="pular-para-conteudo" href="#conteudo">
          Pular para o conteúdo
        </a>

        {/* Barra do site, em TODAS as páginas.
            Antes disto, a ajuda só existiria para quem soubesse procurá-la —
            e quem chega por uma busca cai direto na página de um município,
            nunca na capa. A barra também dá a cada uma das 1.804 páginas um
            link para a raiz, o que reforça o grafo interno consertado hoje. */}
        <div className="barra-site">
          <a className="barra-marca" href="/">
            {/* A marca conta a tese em vez de decorar: barras contra uma
                régua tracejada, que é o que toda página deste site faz --
                pôr um número ao lado do limite que o julga. O SVG é o mesmo
                arquivo que serve de favicon. */}
            <svg
              className="barra-icone" viewBox="0 0 32 32" aria-hidden="true"
              width="20" height="20"
            >
              <rect width="32" height="32" rx="7" fill="#0f5c8c" />
              <rect x="6.5" y="19" width="4.5" height="6" rx="1.2" fill="#fff" />
              <rect x="13.75" y="15" width="4.5" height="10" rx="1.2" fill="#fff" />
              <rect x="21" y="8" width="4.5" height="17" rx="1.2" fill="#fff" />
              <line
                x1="4" x2="28" y1="12.5" y2="12.5" stroke="#7fc4ec"
                strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3.2 2.6"
              />
            </svg>
            Números Públicos
          </a>
          {/* A busca fica ENTRE a marca e os atalhos, e não no fim: é o
              controle mais usado da barra, e o olho a procura ao lado do
              nome do site. Em tela estreita ela desce para a linha de baixo
              (ver `busca-cabecalho.module.css`), porque espremida ao lado
              dos atalhos mostraria menos de oito caracteres. */}
          <BuscaCabecalho />
          <nav aria-label="Atalhos do site">
            <a href="/ajuda/">Ajuda</a>
            <a href="/ajuda/#baixar">Baixar dados</a>
          </nav>
        </div>

        {children}

        <div className="rodape-site">
          <nav aria-label="Rodapé">
            <a href="/">Início</a>
            <a href="/ajuda/">Ajuda</a>
            <a href="/ajuda/#erro">Achei um número errado</a>
            <a
              href="https://github.com/peterwkdev-creator/observatorio-ne"
              rel="noopener"
            >
              Código-fonte
            </a>
          </nav>
          <p>
            Dados abertos do IBGE e do SICONFI/Tesouro Nacional, com a fonte e a
            data de coleta ao lado de cada número. Software livre sob AGPL-3.0.
            Este site não coleta nada sobre quem o visita.
          </p>
        </div>
      </body>
    </html>
  );
}
