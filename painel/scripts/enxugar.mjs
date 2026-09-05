/**
 * Remove os payloads RSC do build estático.
 *
 *     node scripts/enxugar.mjs          # remove
 *     node scripts/enxugar.mjs --seco   # só conta, não apaga
 *
 * ## O que são e por que saem
 *
 * O Next gera **duas** versões de cada página: o HTML, que o navegador e o
 * buscador leem, e um payload RSC em `.txt`, que serve à navegação
 * cliente-a-cliente. Medido em 04/09/2026: são **28.007 arquivos e 747 MB**,
 * contra 11.229 arquivos e 533 MB de todo o resto.
 *
 * Nenhum dado se perde, e isso foi **conferido, não suposto**: comparando os
 * números do HTML completo com os dos `.txt` de uma página, os únicos que
 * existem só no payload são `prefetchHints` e `staleTime` — metadados de
 * roteamento do próprio Next.
 *
 * O que se perde é comportamento: a navegação entre páginas passa a recarregar
 * a página inteira. Aqui isso é quase nada — o site já usa `prefetch={false}`
 * em todos os links, porque a pré-busca custava 269 KB por página e quem chega
 * de busca abre uma e sai.
 *
 * ## O que isso destrava
 *
 * Com 39.235 arquivos e 1.324 MB, o site **não cabia** nem no GitHub Pages
 * (teto de 1 GB) nem na Cloudflare Pages gratuita (teto de 20.000 arquivos).
 * Enxugado, cabe folgado nos dois — e essas são as hospedagens sem a cláusula
 * de uso não comercial que a Vercel tem no plano gratuito.
 *
 * ## A regra é uma LISTA DO QUE SAI, nunca do que fica
 *
 * A primeira tentativa foi "apagar todo `.txt` menos o `robots.txt`". Ela
 * teria apagado **a chave do IndexNow**, que é um `.txt` na raiz e cujo
 * sumiço só apareceria semanas depois, como um 403 no próximo envio.
 *
 * Lista de exclusão apodrece: cada arquivo novo em `public/` precisaria ser
 * lembrado. Lista de inclusão descreve o que se conhece, e o que não casa
 * **fica** — que é o lado seguro do erro.
 */

import { readdirSync, statSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(AQUI, "..", "out");
const seco = process.argv.includes("--seco");

/**
 * É payload RSC?
 *
 * Três formas, todas geradas pelo Next e nenhuma escrita por nós:
 * - qualquer coisa dentro de uma pasta `__next.*`
 * - um arquivo `__next.*.txt`
 * - `index.txt` **ao lado de um `index.html`** — a segunda condição é o que
 *   separa o payload de um `.txt` que alguém publicou de propósito
 */
function ehPayload(arquivo, dir) {
  const base = path.basename(arquivo);
  if (!base.endsWith(".txt")) return false;
  if (dir.split(path.sep).some((p) => p.startsWith("__next."))) return true;
  if (base.startsWith("__next.")) return true;
  if (base === "index.txt" && existsSync(path.join(dir, "index.html"))) return true;
  return false;
}

let removidos = 0;
let bytes = 0;
const mantidos = [];

function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = path.join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) {
      varrer(caminho);
      // Pasta que ficou vazia depois da limpeza some junto; uma árvore de
      // diretórios vazios conta para o limite de arquivos de alguns hosts e
      // não serve a ninguém.
      try {
        if (!seco && readdirSync(caminho).length === 0) rmdirSync(caminho);
      } catch { /* corrida com outro processo: não é problema nosso */ }
      continue;
    }
    if (nome.endsWith(".txt") && !ehPayload(caminho, dir)) {
      mantidos.push(path.relative(OUT, caminho).replace(/\\/g, "/"));
      continue;
    }
    if (!ehPayload(caminho, dir)) continue;
    removidos += 1;
    bytes += st.size;
    if (!seco) unlinkSync(caminho);
  }
}

if (!existsSync(OUT)) {
  console.error("out/ não existe — rode `npm run build` antes.");
  process.exit(1);
}

varrer(OUT);

const mb = (n) => `${(n / 1024 / 1024).toFixed(0)} MB`;
console.log(`${seco ? "[seco] " : ""}payloads RSC: ${removidos} arquivos, ${mb(bytes)}`);
console.log(`.txt mantidos (${mantidos.length}): ${mantidos.join(", ") || "nenhum"}`);

// A chave do IndexNow é o `.txt` cuja ausência não dói onde nasce: some aqui,
// e o 403 aparece no próximo envio, que pode ser semanas depois.
const chave = mantidos.find((m) => /^[a-f0-9]{32}\.txt$/.test(m));
if (!chave) {
  console.error("\nA chave do IndexNow NÃO está entre os mantidos. "
                + "Algo apagou o que não devia — ver `ehPayload`.");
  process.exit(1);
}
console.log(`chave do IndexNow preservada: ${chave}`);
