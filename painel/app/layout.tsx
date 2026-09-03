import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Observatório NE — dados abertos dos 1.794 municípios do Nordeste",
  description:
    "População, PIB e população estimada dos 1.794 municípios dos nove " +
    "estados do Nordeste, direto das APIs públicas do IBGE, com a fonte e a " +
    "data de coleta ao lado de cada número.",
  metadataBase: new URL("https://observatorio-ne.vercel.app"),
  openGraph: {
    title: "Observatório NE",
    description:
      "Dados abertos dos 1.794 municípios do Nordeste, com procedência.",
    locale: "pt_BR",
    type: "website",
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
