import { deflateRawSync } from "node:zlib";

/**
 * Escrita de `.xlsx`, sem dependência.
 *
 * ## Por que um XLSX, tendo CSV
 *
 * O CSV serve quem programa. O público deste site é outro — vereador,
 * jornalista, servidor de prefeitura — e ele vive no Excel. Um CSV ainda exige
 * escolher separador e codificação na importação, e **número vira texto** se a
 * escolha sair errada: aí a soma não fecha e a planilha mente sem avisar.
 *
 * Num XLSX o número é número, o cabeçalho vem congelado, e cabem **abas**: os
 * dados numa, o dicionário de colunas noutra, a procedência numa terceira. É a
 * diferença entre entregar um arquivo e entregar uma planilha pronta.
 *
 * ## Por que sem biblioteca
 *
 * O `stack.md` cobra justificativa por dependência. As bibliotecas de Excel
 * resolvem fórmulas, gráficos, estilos condicionais e macros — nada disso é
 * necessário aqui, e o custo seria assumir megabytes de código de terceiro para
 * escrever quatro arquivos XML dentro de um ZIP.
 *
 * O que existe de verdade neste módulo é o **escritor de ZIP**, porque o Node
 * traz `deflateRawSync` e não traz empacotador. São ~70 linhas de formato
 * documentado, e o resto é XML declarativo.
 *
 * **O arquivo gerado é conferido abrindo-o**, não lendo o código: o
 * `scripts/conferir-xlsx.mjs` usa o LibreOffice para converter de volta a CSV
 * e comparar os valores. Planilha que o Excel recusa é pior que planilha
 * nenhuma, e isso não se descobre relendo o gerador.
 */

// ---------------------------------------------------------------- ZIP

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

type Entrada = { nome: string; dados: Buffer };

/**
 * Empacota num ZIP. Formato mínimo: um cabeçalho local por arquivo, o
 * diretório central no fim, e o registro de fim do diretório.
 *
 * Data fixa em 1980-01-01 (o zero do formato MS-DOS) **de propósito**: com a
 * data corrente, dois builds do mesmo dado gerariam arquivos diferentes byte a
 * byte, e um `git diff` do artefato deixaria de significar alguma coisa.
 */
function zip(entradas: Entrada[]): Buffer {
  const locais: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entradas) {
    const nome = Buffer.from(e.nome, "utf-8");
    const comprimido = deflateRawSync(e.dados, { level: 9 });
    const crc = crc32(e.dados);

    const local = Buffer.alloc(30 + nome.length);
    local.writeUInt32LE(0x04034b50, 0);      // assinatura
    local.writeUInt16LE(20, 4);              // versão necessária
    local.writeUInt16LE(0x0800, 6);          // sinalizador: nome em UTF-8
    local.writeUInt16LE(8, 8);               // método: deflate
    local.writeUInt16LE(0, 10);              // hora
    local.writeUInt16LE(33, 12);             // data: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(e.dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);              // sem campo extra
    nome.copy(local, 30);
    locais.push(local, comprimido);

    const dir = Buffer.alloc(46 + nome.length);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);                // versão que criou
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(33, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(comprimido.length, 20);
    dir.writeUInt32LE(e.dados.length, 24);
    dir.writeUInt16LE(nome.length, 28);
    dir.writeUInt32LE(0, 38);                // atributos externos
    dir.writeUInt32LE(offset, 42);
    nome.copy(dir, 46);
    central.push(dir);

    offset += local.length + comprimido.length;
  }

  const corpoCentral = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(corpoCentral.length, 12);
  fim.writeUInt32LE(offset, 16);

  return Buffer.concat([...locais, corpoCentral, fim]);
}

// ---------------------------------------------------------------- XLSX

export type Celula = string | number | null | undefined;
export type Aba = {
  nome: string;
  /** A primeira linha é o cabeçalho: ela é congelada e fica em negrito. */
  linhas: Celula[][];
  /** Largura de cada coluna, em caracteres. Sem isso tudo sai com 8,43. */
  larguras?: number[];
};

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** `A1`, `Z1`, `AA1`... A coluna 27 é `AA`, e errar isso desloca a planilha
 *  inteira em silêncio a partir da 27ª coluna. */
function ref(coluna: number, linha: number): string {
  let c = "";
  let n = coluna + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    c = String.fromCharCode(65 + r) + c;
    n = Math.floor((n - 1) / 26);
  }
  return `${c}${linha + 1}`;
}

function folha(aba: Aba): string {
  const cols = aba.larguras?.length
    ? `<cols>${aba.larguras
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const linhas = aba.linhas
    .map((linha, y) => {
      const celulas = linha
        .map((v, x) => {
          if (v === null || v === undefined || v === "") return "";
          const r = ref(x, y);
          // Cabeçalho (estilo 1) em negrito; o resto sem estilo.
          const estilo = y === 0 ? ' s="1"' : "";
          if (typeof v === "number" && Number.isFinite(v)) {
            return `<c r="${r}"${estilo}><v>${v}</v></c>`;
          }
          // `t="inlineStr"` em vez de tabela de strings compartilhadas: com
          // 5.571 linhas a tabela economizaria pouco (quase todo texto é
          // único) e custaria um quinto arquivo XML e um índice para manter.
          return `<c r="${r}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escapar(String(v))}</t></is></c>`;
        })
        .join("");
      return `<row r="${y + 1}">${celulas}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">
<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
</sheetView></sheetViews>
${cols}<sheetData>${linhas}</sheetData></worksheet>`;
}

/** Monta o `.xlsx`. As abas saem na ordem em que vierem. */
export function xlsx(abas: Aba[]): Buffer {
  const n = abas.length;
  const folhas = abas.map((a, i) => ({
    nome: `xl/worksheets/sheet${i + 1}.xml`,
    dados: Buffer.from(folha(a), "utf-8"),
  }));

  const arquivos: Entrada[] = [
    {
      nome: "[Content_Types].xml",
      dados: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`, "utf-8"),
    },
    {
      nome: "_rels/.rels",
      dados: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`, "utf-8"),
    },
    {
      nome: "xl/workbook.xml",
      dados: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${abas.map((a, i) => `<sheet name="${escapar(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`, "utf-8"),
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      dados: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`, "utf-8"),
    },
    {
      // Dois estilos: 0 é o padrão, 1 é o negrito do cabeçalho. Um `styles.xml`
      // ausente faz o Excel recusar o arquivo inteiro, mesmo sem estilo nenhum.
      nome: "xl/styles.xml",
      dados: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="2"><xf xfId="0"/><xf fontId="1" applyFont="1" xfId="0"/></cellXfs>
</styleSheet>`, "utf-8"),
    },
    ...folhas,
  ];

  return zip(arquivos);
}

/** Cabeçalhos HTTP de uma planilha que o navegador deve **baixar**. */
export function cabecalhosXlsx(nomeArquivo: string): HeadersInit {
  return {
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
  };
}
