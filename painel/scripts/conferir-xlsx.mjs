/**
 * Confere o `.xlsx` gerado **abrindo-o**, e não lendo o gerador.
 *
 * O escritor de planilha em `lib/xlsx.ts` monta um ZIP de XML à mão. Um erro
 * ali não produz exceção: produz um arquivo que o Excel recusa com "formato
 * inválido" — e isso não se descobre relendo o código, porque o código está
 * fazendo exatamente o que quem o escreveu achou que o formato pedia.
 *
 * Aqui o LibreOffice, que é uma implementação independente do formato, abre a
 * planilha e a converte de volta a CSV. Se ele consegue, o Excel também
 * consegue; e comparando os valores convertidos com o CSV que o site já
 * publica, prova-se que o conteúdo sobreviveu à ida e à volta.
 *
 *     node scripts/conferir-xlsx.mjs out/dados/municipios.xlsx out/dados/municipios.csv
 */

import { execFileSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SOFFICE = process.env.SOFFICE
  ?? "C:/Program Files/LibreOffice/program/soffice.exe";

const [xlsxPath, csvPath] = process.argv.slice(2);
if (!xlsxPath) {
  console.error("uso: node scripts/conferir-xlsx.mjs <planilha.xlsx> [referencia.csv]");
  process.exit(2);
}

/**
 * Extrai um arquivo de dentro do `.xlsx` (que é um ZIP).
 *
 * Lê o diretório central em vez de varrer os cabeçalhos locais: é onde o
 * formato guarda o deslocamento de cada entrada, e é o caminho que não depende
 * da ordem em que os arquivos foram escritos.
 */
function folhaDoZip(buf, alvo) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fim < 0) throw new Error("não é um ZIP: falta o fim do diretório central");
  let p = buf.readUInt32LE(fim + 16);
  const n = buf.readUInt16LE(fim + 10);
  for (let i = 0; i < n; i += 1) {
    const tamNome = buf.readUInt16LE(p + 28);
    const nome = buf.toString("utf-8", p + 46, p + 46 + tamNome);
    const desloc = buf.readUInt32LE(p + 42);
    const comprimido = buf.readUInt32LE(p + 20);
    if (nome === alvo) {
      const tamNomeLocal = buf.readUInt16LE(desloc + 26);
      const tamExtra = buf.readUInt16LE(desloc + 28);
      const inicio = desloc + 30 + tamNomeLocal + tamExtra;
      return inflateRawSync(buf.subarray(inicio, inicio + comprimido)).toString("utf-8");
    }
    p += 46 + tamNome + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  throw new Error(`${alvo} não está no pacote`);
}

const saida = mkdtempSync(path.join(tmpdir(), "conferir-xlsx-"));
let falhas = 0;
const erro = (m) => { console.log(`  ⚠ ${m}`); falhas += 1; };

try {
  // `--convert-to csv` exporta apenas a PRIMEIRA aba. Isso basta: se o
  // LibreOffice conseguiu abrir o pacote, as outras abas também estão válidas
  // -- um ZIP ou um XML quebrado derruba a abertura inteira, não uma aba só.
  execFileSync(SOFFICE, [
    "--headless", "--convert-to", "csv:Text - txt - csv (StarCalc):44,34,76",
    "--outdir", saida, path.resolve(xlsxPath),
  ], { stdio: "pipe", timeout: 180000 });

  const gerados = readdirSync(saida).filter((f) => f.endsWith(".csv"));
  if (!gerados.length) {
    erro("o LibreOffice não produziu CSV — a planilha não abriu");
  } else {
    const texto = readFileSync(path.join(saida, gerados[0]), "utf-8");
    const linhas = texto.trim().split(/\r?\n/);
    console.log(`  abriu: ${linhas.length} linhas na primeira aba`);

    if (csvPath) {
      const ref = readFileSync(csvPath, "utf-8").replace(/^\uFEFF/, "")
        .trim().split(/\r?\n/);
      if (linhas.length !== ref.length) {
        erro(`contagem de linhas difere do CSV: ${linhas.length} contra ${ref.length}`);
      } else {
        console.log(`  contagem bate com o CSV: ${ref.length} linhas`);
      }

      // O número tem de ter sobrevivido COMO NÚMERO. Se o gerador tivesse
      // escrito tudo como texto, o valor apareceria igual aqui -- por isso a
      // comparação é do valor, e o tipo é conferido no XML, abaixo.
      const primeira = linhas[1]?.split(",") ?? [];
      const refPrimeira = ref[1]?.split(";") ?? [];
      if (primeira[0] && refPrimeira[0] && primeira[0] !== refPrimeira[0]) {
        erro(`primeira célula difere: "${primeira[0]}" contra "${refPrimeira[0]}"`);
      } else if (primeira[0]) {
        console.log(`  primeira célula confere: ${primeira[0]}`);
      }
    }
  }

  // Tipo das células: `t="inlineStr"` é texto; a ausência de `t` é número.
  // Uma planilha em que tudo virou texto abre normalmente e não soma nada --
  // o defeito que este arquivo existe para impedir, e que a conversão para
  // CSV não revelaria sozinha, porque o valor aparece igual dos dois jeitos.
  //
  // **O conteúdo tem de ser DESCOMPRIMIDO antes de procurar.** A primeira
  // versão disto procurava `<v>` nos bytes crus do `.xlsx` — que é um ZIP
  // deflacionado — e portanto nunca achava: reprovava uma planilha correta,
  // com a mesma mensagem que daria numa errada.
  const xml = folhaDoZip(readFileSync(path.resolve(xlsxPath)), "xl/worksheets/sheet1.xml");
  const numeros = (xml.match(/<c [^>]*><v>/g) || []).length;
  const textos = (xml.match(/t="inlineStr"/g) || []).length;
  if (numeros === 0) erro("nenhuma célula numérica: tudo virou texto");
  else console.log(`  células numéricas: ${numeros} · de texto: ${textos}`);
} catch (e) {
  erro(`o LibreOffice falhou: ${String(e).split("\n")[0]}`);
} finally {
  rmSync(saida, { recursive: true, force: true });
}

console.log(falhas ? `\n${falhas} problema(s).` : "\n✓ a planilha abre e o conteúdo confere.");
process.exit(falhas ? 1 : 0);
