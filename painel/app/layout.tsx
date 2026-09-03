import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Números Públicos — dados abertos dos municípios brasileiros",
  description:
    "População, PIB, gasto com pessoal e despesa por função dos 1.794 " +
    "municípios dos nove estados do Nordeste, direto das APIs públicas do " +
    "IBGE e do Tesouro Nacional, com a fonte e a data de coleta ao lado de " +
    "cada número.",
  metadataBase: new URL("https://www.numerospublicos.com.br"),
  openGraph: {
    title: "Números Públicos",
    description:
      "Dados abertos dos 1.794 municípios do Nordeste, com procedência.",
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
      "Dados abertos dos 1.794 municípios do Nordeste, com procedência.",
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
        {children}
      </body>
    </html>
  );
}
