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

/**
 * Os dois temas, sempre.
 *
 * Medido em 03/09/2026: o Chrome sem cabeça desta máquina abre em **escuro**,
 * e a auditoria rodava só nele. Deu "sem achados" por cinco execuções seguidas
 * enquanto o tema claro tinha texto a **3,53:1**, abaixo do mínimo de 4,5:1 —
 * atestado de saúde para um tema que ela nunca olhou.
 *
 * Contraste é a única checagem daqui que depende do tema; as outras não mudam.
 * Rodar as duas mesmo assim custa segundos e evita a pergunta "será que este
 * achado é dos dois?".
 */
const TEMAS = ["light", "dark"];

for (const caminho of caminhos) {
 for (const tema of TEMAS) {
  const p = await nav.newPage();
  await p.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: tema },
  ]);
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

    // ---- contraste (WCAG 1.4.3, AA) ----
    // 4,5:1 para texto normal; 3:1 para texto grande (>=24px, ou >=18.66px
    // em negrito). Medido no que ESTA na tela, com a cor de fundo efetiva --
    // um elemento transparente herda o fundo do ancestral, e comparar contra
    // "transparent" daria contraste infinito e um relatorio limpo e falso.
    const lum = (c) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const rgb = (s) => {
      const m = s.match(/[\d.]+/g);
      return m ? m.slice(0, 3).map(Number) : null;
    };
    const opaco = (s) => {
      const m = s.match(/[\d.]+/g);
      return !!m && (m.length < 4 || Number(m[3]) > 0.95);
    };
    const fundoDe = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (opaco(c)) return rgb(c);
        n = n.parentElement;
      }
      return rgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
    };
    const razao = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };

    const semContraste = [];
    for (const el of document.querySelectorAll("body *")) {
      // so elementos com texto PROPRIO, para nao medir o mesmo texto varias
      // vezes subindo pela arvore
      const texto = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      if (!texto) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const cor = rgb(cs.color);
      if (!cor) continue;
      const px = parseFloat(cs.fontSize);
      const peso = parseInt(cs.fontWeight, 10) || 400;
      const grande = px >= 24 || (px >= 18.66 && peso >= 700);
      const exigido = grande ? 3 : 4.5;
      const r = razao(cor, fundoDe(el));
      if (r < exigido) {
        semContraste.push(
          `"${texto.slice(0, 22)}" ${r.toFixed(2)}:1 (exige ${exigido}, ${px}px)`
        );
      }
    }

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
      saltos, pequenos, tipos, semContraste,
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
      // Página `noindex` não é indexada, então cobrar dado estruturado dela é
      // cobrar trabalho que nenhum buscador vai ler. O 404 é o caso: ele
      // declara `noindex` de propósito.
      noindex: /noindex/i.test(
        document.querySelector("meta[name=robots]")?.content || ""),
      nos: document.querySelectorAll("*").length,
    };
  });

  const por = {};
  for (const x of recursos) por[x.tipo] = (por[x.tipo] || 0) + x.bytes;
  const total = Object.values(por).reduce((a, b) => a + b, 0);

  console.log(`\n━━━ ${caminho}  [${tema}]`);
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
  flag(r.semContraste.length,
    `contraste abaixo do mínimo (WCAG 1.4.3 AA): ${JSON.stringify(r.semContraste.slice(0, 6))}`);
  flag(r.rolaHorizontal, "rolagem horizontal");
  flag(!r.tipos.length && !r.noindex, "sem JSON-LD");
  flag(r.titulo > 60, `title com ${r.titulo}ch (o Google corta perto de 60)`);
  flag(r.descricao > 160, `description com ${r.descricao}ch (o Google corta perto de 160)`);

  achados += problemas.length;
  console.log(problemas.length ? "  ⚠ " + problemas.join("\n  ⚠ ") : "  ✓ sem achados");
  await p.close();
 }
}

await nav.close();
console.log(`\n${achados} achado(s).`);
process.exit(achados ? 1 : 0);
