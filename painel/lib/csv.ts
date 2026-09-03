/**
 * Geração de CSV. **Módulo puro** — sem I/O, importável de qualquer lado.
 *
 * O separador é **ponto e vírgula** e o decimal é **vírgula**, com BOM UTF-8
 * na frente. Não é capricho: o público deste site abre planilha em Excel com
 * locale pt-BR, onde `,` é decimal e o separador esperado é `;`. Um CSV
 * "padrão" (vírgula separando, ponto decimal) abre nesse Excel com tudo
 * amontoado numa coluna só — tecnicamente correto e inútil na prática.
 *
 * O BOM tem custo: alguns analisadores o entregam como caractere invisível no
 * primeiro cabeçalho. Vale mesmo assim, porque sem ele o Excel lê "Município"
 * como "MunicÃ­pio", e acento quebrado é pior que um byte a mais.
 */

export const BOM = "﻿";
export const SEPARADOR = ";";

/** Escapa um campo. Aspas duplicadas e o campo entre aspas quando precisa. */
function campo(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? numero(v) : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Número com vírgula decimal, sem separador de milhar — milhar atrapalha
 *  quem for reimportar, e o Excel entende sem ele. */
function numero(v: number): string {
  return String(v).replace(".", ",");
}

export function paraCsv(
  cabecalho: string[],
  linhas: (string | number | null | undefined)[][],
): string {
  const corpo = [cabecalho, ...linhas]
    .map((l) => l.map(campo).join(SEPARADOR))
    .join("\r\n");
  return BOM + corpo + "\r\n";
}

/** Cabeçalhos HTTP de um CSV que o navegador deve **baixar**, não exibir. */
export function cabecalhosCsv(nomeArquivo: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
  };
}
