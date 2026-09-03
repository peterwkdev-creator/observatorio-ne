/**
 * Auditoria do site gerado: HTML válido, acessibilidade, peso e semântica.
 *
 * Roda contra as PÁGINAS GERADAS, não contra o código-fonte — foi assim que
 * ela achou, em 03/09/2026, um `id` duplicado que o TypeScript não vê, o build
 * não acusa e o navegador não reclama, mas que fazia o leitor de tela anunciar
 * a descrição errada.
 *
 *     npm run build
 *     npx serve out -l 8791          (ou qualquer servidor estático)
 *     node scripts/auditar.mjs http://127.0.0.1:8791 / /ajuda/ /municipio/xxx/
 *
 * ## Por que os critérios têm exceções codificadas
 *
 * Uma auditoria que grita lobo é uma auditoria ignorada, e ignorada ela é pior
 * que nenhuma — dá a sensação de cobertura sem a cobertura. Por isso o critério
 * de alvo de toque implementa as DUAS exceções que o WCAG 2.5.8 prevê, em vez
 * de reprovar todo link menor que 24px:
 *
 * - **inline:** link dentro de uma frase, cuja altura é limitada pela
 *   entrelinha do texto ao redor;
 * - **espaçamento:** alvo pequeno que tem 24px livres em volta, sem outro alvo
 *   dentro dessa área.
 */

import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME
  ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const [base, ...caminhos] = process.argv.slice(2);

if (!base || caminhos.length === 0) {
  console.error("uso: node scripts/auditar.mjs <base> <caminho...>");
  process.exit(2);
}

const nav = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
let achados = 0;

for (const caminho of caminhos) {
  const p = await nav.newPage();
  const recursos = [];
  p.on("response", async (r) => {
    try {
      recursos.push({
        tipo: r.request().resourceType(),
        bytes: (await r.buffer()).length,
      });
    } catch {}
  });
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(base + caminho, { waitUntil: "networkidle0", timeout: 40000 });

  const r = await p.evaluate(() => {
    const ids = {};
    for (const e of document.querySelectorAll("[id]")) ids[e.id] = (ids[e.id] || 0) + 1;

    const alvos = [...document.querySelectorAll("a[href],button,input,select")]
      .map((e) => ({ e, b: e.getBoundingClientRect() }))
      .filter((x) => x.b.width > 0 && x.b.height > 0);

    /** WCAG 2.5.8: link cuja altura é limitada pela entrelinha da frase. */
    const inline = ({ e }) =>
      getComputedStyle(e).display.startsWith("inline")
      && !!e.closest("p, li, figcaption, caption, td, th");

    /** WCAG 2.5.8: 24px livres em volta, sem outro alvo dentro. */
    const espacado = ({ b }, todos) => {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      return !todos.some((o) => {
        if (o.b === b) return false;
        const ox = o.b.x + o.b.width / 2;
        const oy = o.b.y + o.b.height / 2;
        return Math.hypot(cx - ox, cy - oy) < 24;
      });
    };

    const pequenos = alvos
      .filter((x) => x.b.height < 24 || x.b.width < 24)
      .filter((x) => !inline(x))
      .filter((x) => !espacado(x, alvos))
      .map((x) => `${x.e.textContent.trim().slice(0, 22)} (${Math.round(x.b.width)}x${Math.round(x.b.height)})`);

    const niveis = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .map((h) => ({ n: +h.tagName[1], t: h.textContent.trim().slice(0, 30) }));
    const saltos = [];
    for (let i = 1; i < niveis.length; i++) {
      if (niveis[i].n - niveis[i - 1].n > 1) {
        saltos.push(`h${niveis[i - 1].n}→h${niveis[i].n} em "${niveis[i].t}"`);
      }
    }

    // `@graph` é JSON-LD válido e não tem `@type` no topo: olhar os dois.
    const tipos = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => {
        try {
          const j = JSON.parse(s.textContent);
          return j["@graph"] ? j["@graph"].map((x) => x["@type"]).join("+") : j["@type"];
        } catch { return "JSON INVÁLIDO"; }
      });

    return {
      duplicados: Object.entries(ids).filter(([, n]) => n > 1),
      aninhados: [...document.querySelectorAll("a a")].map((a) => a.textContent.trim().slice(0, 24)),
      descQuebrados: [...document.querySelectorAll("[aria-describedby]")]
        .map((e) => e.getAttribute("aria-describedby"))
        .filter((id) => !document.getElementById(id)),
      saltos, pequenos, tipos,
      h1: document.querySelectorAll("h1").length,
      navSemRotulo: [...document.querySelectorAll("nav")]
        .filter((n) => !n.getAttribute("aria-label") && !n.getAttribute("aria-labelledby")).length,
      svgSemNome: [...document.querySelectorAll("svg")]
        .filter((s) => s.getAttribute("aria-hidden") !== "true"
          && !s.getAttribute("aria-label") && !s.querySelector("title")).length,
      imgSemAlt: [...document.querySelectorAll("img")]
        .filter((i) => i.getAttribute("alt") === null).length,
      tabelasSemScope: [...document.querySelectorAll("table")]
        .filter((t) => ![...t.querySelectorAll("th")].some((h) => h.getAttribute("scope"))).length,
      linksVagos: [...document.querySelectorAll("a")]
        .map((a) => a.textContent.trim().toLowerCase())
        .filter((t) => ["aqui", "clique aqui", "leia mais", "mais", "link"].includes(t)).length,
      rolaHorizontal: document.documentElement.scrollWidth > window.innerWidth,
      titulo: document.title.length,
      descricao: (document.querySelector("meta[name=description]")?.content || "").length,
      lang: document.documentElement.lang,
      nos: document.querySelectorAll("*").length,
    };
  });

  const por = {};
  for (const x of recursos) por[x.tipo] = (por[x.tipo] || 0) + x.bytes;
  const total = Object.values(por).reduce((a, b) => a + b, 0);

  console.log(`\n━━━ ${caminho}`);
  console.log(`  ${(total / 1024).toFixed(0)} KB  ` +
    Object.entries(por).sort((a, b) => b[1] - a[1])
      .map(([t, b]) => `${t} ${(b / 1024).toFixed(0)}`).join("  "));
  console.log(`  DOM ${r.nos} nós · title ${r.titulo}ch · description ${r.descricao}ch · ` +
    `lang "${r.lang}" · JSON-LD ${JSON.stringify(r.tipos)}`);

  const problemas = [];
  const flag = (cond, msg) => { if (cond) problemas.push(msg); };
  flag(r.duplicados.length, `id duplicado: ${JSON.stringify(r.duplicados)}`);
  flag(r.aninhados.length, `âncora dentro de âncora: ${JSON.stringify(r.aninhados)}`);
  flag(r.descQuebrados.length, `aria-describedby órfão: ${r.descQuebrados}`);
  flag(r.saltos.length, `salto de título: ${r.saltos.join(" | ")}`);
  flag(r.h1 !== 1, `h1 = ${r.h1}`);
  flag(r.navSemRotulo, `nav sem rótulo: ${r.navSemRotulo}`);
  flag(r.svgSemNome, `svg sem nome: ${r.svgSemNome}`);
  flag(r.imgSemAlt, `img sem alt: ${r.imgSemAlt}`);
  flag(r.tabelasSemScope, `tabela sem scope: ${r.tabelasSemScope}`);
  flag(r.linksVagos, `link de texto vago: ${r.linksVagos}`);
  flag(r.pequenos.length, `alvo < 24px sem exceção: ${JSON.stringify(r.pequenos)}`);
  flag(r.rolaHorizontal, "rolagem horizontal");
  flag(!r.tipos.length, "sem JSON-LD");
  flag(r.titulo > 60, `title com ${r.titulo}ch (o Google corta perto de 60)`);
  flag(r.descricao > 160, `description com ${r.descricao}ch (o Google corta perto de 160)`);

  achados += problemas.length;
  console.log(problemas.length ? "  ⚠ " + problemas.join("\n  ⚠ ") : "  ✓ sem achados");
  await p.close();
}

await nav.close();
console.log(`\n${achados} achado(s).`);
process.exit(achados ? 1 : 0);
