/**
 * Avisa os buscadores que o site mudou, pelo protocolo IndexNow.
 *
 *     node scripts/indexnow.mjs            # só se o dado mudou desde o último
 *     node scripts/indexnow.mjs --forcar   # manda de qualquer jeito
 *     node scripts/indexnow.mjs --seco     # mostra o que faria, sem enviar
 *
 * ## Por que isto existe
 *
 * Medido em 04/09/2026, um dia depois de publicar: o Google tinha **detectado**
 * as 5.600 URLs pelo sitemap e **rastreado apenas a capa**. Sitemap resolve
 * descoberta; ele não apressa nada. IndexNow é o outro lado — um aviso ativo de
 * que a URL mudou, e o buscador prioriza a fila dele.
 *
 * ## Quem escuta
 *
 * Bing, Yandex, Naver, Seznam, Yep e Amazon — não o Google, que mantém a API de
 * indexação restrita a ofertas de emprego e transmissões ao vivo.
 *
 * **E o Bing é a razão principal de valer a pena**, não pela busca dele: é o
 * índice que alimenta o ChatGPT Search e o Copilot. Para um site cujo conteúdo
 * é resposta factual com fonte ao lado, ser citável por assistente é
 * provavelmente mais valioso do que posição no Bing.
 *
 * ## A trava: só envia quando o DADO muda
 *
 * A orientação do protocolo é enviar **quando o conteúdo muda**, e um site
 * estático se reconstrói inteiro a cada deploy — inclusive quando o que mudou
 * foi uma cor de CSS. Mandar 5.600 URLs por causa disso é abusar de uma cota
 * que cada buscador define e não publica.
 *
 * A trava compara a impressão digital dos **arquivos de dados**, e não do
 * HTML gerado: é o que de fato muda a resposta que a página dá. Um ajuste de
 * layout não avisa ninguém; uma coleta nova avisa todo mundo.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PAINEL = path.resolve(AQUI, "..");

const CHAVE = "f0aeb82722eec0f6b54f7d0c9b4274c8";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.numerospublicos.com.br";
const ENDPOINT = "https://api.indexnow.org/indexnow";
/** O protocolo recusa acima disto, com HTTP 422. */
const LOTE = 10000;
const ESTADO = path.join(PAINEL, ".indexnow.json");

const args = new Set(process.argv.slice(2));
const forcar = args.has("--forcar");
const seco = args.has("--seco");

/** A impressão digital do que a página *diz* — os dados, não o HTML. */
function impressaoDosDados() {
  const dir = path.join(PAINEL, "dados");
  const h = createHash("sha256");
  for (const nome of readdirSync(dir).sort()) {
    if (!nome.endsWith(".json")) continue;
    h.update(nome);
    h.update(readFileSync(path.join(dir, nome)));
  }
  return h.digest("hex").slice(0, 16);
}

/** As URLs do sitemap gerado. Fonte única: se não está lá, não existe. */
function urlsDoSitemap() {
  const xml = path.join(PAINEL, "out", "sitemap.xml");
  if (!existsSync(xml)) {
    throw new Error(
      "out/sitemap.xml não existe — rode `npm run build` antes. Enviar URLs " +
      "que o build ainda não publicou pediria ao buscador para rastrear 404.",
    );
  }
  const texto = readFileSync(xml, "utf-8");
  return [...texto.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function enviar(urls) {
  const corpo = JSON.stringify({
    host: new URL(SITE).host,
    key: CHAVE,
    keyLocation: `${SITE}/${CHAVE}.txt`,
    urlList: urls,
  });
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: corpo,
  });
  return { status: r.status, texto: (await r.text()).slice(0, 300) };
}

/**
 * O que cada código significa. Traduzido porque `200` e `202` são os dois
 * sucessos e `403` é o único que exige ação humana — e ler isso na hora
 * evita concluir "não funcionou" de um `202`.
 */
const SIGNIFICADO = {
  200: "aceito",
  202: "aceito; a chave ainda está sendo validada",
  400: "requisição malformada",
  403: "chave recusada",
  422: "URLs fora do domínio declarado, ou lote grande demais",
  429: "cota excedida — esperar e repetir",
};

/**
 * O 403 tem DOIS significados opostos, e o corpo da resposta é quem separa.
 *
 * Medido em 04/09/2026, no primeiro envio real: a conferência prévia passou —
 * a chave estava no ar, 32 bytes, `text/plain` — e mesmo assim veio 403, com
 * `errorCode: "SiteVerificationNotCompleted"`. **A verificação do IndexNow é
 * assíncrona**: publicar a chave não a conclui, só a torna possível.
 *
 * O rótulo original dizia "CHAVE INVÁLIDA — o arquivo na raiz não confere", e
 * teria mandado quem lesse conferir um arquivo perfeito. Um diagnóstico que
 * aponta para o lugar errado custa mais que nenhum diagnóstico.
 *
 * A conferência prévia continua valendo: ela é necessária e não suficiente.
 */
function diagnostico(status, corpo) {
  if (status !== 403) return SIGNIFICADO[status] ?? "código inesperado";
  let codigo = "";
  try {
    codigo = JSON.parse(corpo).errorCode ?? "";
  } catch {
    // Corpo não-JSON: cai no genérico, e o corpo cru é impresso de qualquer
    // forma pelo chamador.
  }
  if (codigo === "SiteVerificationNotCompleted") {
    return "a verificação do domínio ainda não concluiu — ESPERAR e repetir, " +
           "a chave está certa";
  }
  return `chave recusada${codigo ? ` (${codigo})` : ""} — conferir se o ` +
         "arquivo na raiz tem exatamente a chave enviada";
}

/**
 * O fluxo inteiro numa função, para poder sair por `return`.
 *
 * `process.exit()` com uma requisição em voo **aborta o processo no Windows**
 * — `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` — e o código de
 * saída se perde no meio do estouro. Quem chama o script num pipeline conclui
 * "passou" de uma falha. Sair por `return` deixa o Node fechar os handles.
 */
async function principal() {
  const impressao = impressaoDosDados();
  const anterior = existsSync(ESTADO)
    ? JSON.parse(readFileSync(ESTADO, "utf-8"))
    : null;

  console.log(`impressão dos dados: ${impressao}`);
  if (anterior) {
    console.log(`último envio:        ${anterior.impressao} em ${anterior.em}`);
  }

  if (anterior?.impressao === impressao && !forcar) {
    console.log(
      "\nO dado não mudou desde o último envio. Nada a avisar.\n" +
      "  (`--forcar` manda mesmo assim; use só se souber por quê.)",
    );
    return 0;
  }

  const urls = urlsDoSitemap();
  console.log(`\n${urls.length} URLs no sitemap.`);

  if (seco) {
    console.log("--seco: nada foi enviado. Primeiras três:");
    for (const u of urls.slice(0, 3)) console.log(`  ${u}`);
    return 0;
  }

  /**
   * A chave TEM de estar no ar antes de submeter.
   *
   * Sem isto, o primeiro envio depois de gerar a chave volta **403** — e o 403 é
   * o único código que exige ação humana, então gastar uma submissão para
   * descobrir que o deploy ainda não subiu é o erro fácil de cometer uma vez por
   * chave. A conferência custa uma requisição e é feita contra o site VIVO,
   * nunca contra o `out/` local: o que o buscador vai ler é o publicado.
   */
  async function chaveNoAr() {
    const url = `${SITE}/${CHAVE}.txt`;
    try {
      const r = await fetch(url);
      if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}` };
      const corpo = (await r.text()).trim();
      if (corpo !== CHAVE) {
        return { ok: false, motivo: `conteúdo diferente da chave (${corpo.length} bytes)` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, motivo: String(e).split("\n")[0] };
    }
  }

  const chave = await chaveNoAr();
  if (!chave.ok) {
    console.error(
      `\nA chave não está acessível em ${SITE}/${CHAVE}.txt — ${chave.motivo}.\n` +
      "Publique o site antes de avisar os buscadores: submeter com a chave fora " +
      "do ar devolve 403 e gasta a submissão.",
    );
    return 1;
  }
  console.log(`chave conferida no ar: ${SITE}/${CHAVE}.txt`);

  let falhou = false;
  for (let i = 0; i < urls.length; i += LOTE) {
    const lote = urls.slice(i, i + LOTE);
    const { status, texto } = await enviar(lote);
    const nota = diagnostico(status, texto);
    console.log(`lote de ${lote.length}: HTTP ${status} — ${nota}`);
    if (texto.trim()) console.log(`  resposta: ${texto.trim()}`);
    if (status !== 200 && status !== 202) falhou = true;
  }

  if (falhou) {
    console.log("\nEnvio não concluído. O estado NÃO foi gravado, então a " +
                "próxima execução tenta de novo.");
    return 1;
  }

  writeFileSync(
    ESTADO,
    `${JSON.stringify({ impressao, em: new Date().toISOString(), urls: urls.length }, null, 2)}\n`,
    "utf-8",
  );
  console.log(`\n✓ ${urls.length} URLs avisadas. Estado gravado em .indexnow.json.`);
  return 0;
}

process.exitCode = await principal();
