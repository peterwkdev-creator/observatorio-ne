// Mede a latencia de interacao da busca da capa, que e o unico ponto
// interativo do site -- e o que a expansao de 1.794 para 5.571 linhas
// multiplicou por tres. INP e o Core Web Vital mais reprovado da web.
import puppeteer from "puppeteer-core";

const nav = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
});
const p = await nav.newPage();
await p.setViewport({ width: 1280, height: 900 });

// CPU 4x mais lenta: um celular mediano, que e onde INP reprova.
const cdp = await p.createCDPSession();
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

await p.goto(process.argv[2], { waitUntil: "networkidle0", timeout: 60000 });
await p.evaluateHandle("document.fonts.ready");

// instala o observador de eventos ANTES de digitar
await p.evaluate(() => {
  window.__lat = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.duration > 0) window.__lat.push({ nome: e.name, dur: e.duration });
    }
  }).observe({ type: "event", durationThreshold: 0, buffered: true });
});

const campo = await p.$('input[type="search"], input[type="text"]');
if (!campo) { console.log("  (nenhum campo de busca)"); await nav.close(); process.exit(0); }
await campo.click();

const linhasAntes = await p.evaluate(() => document.querySelectorAll("tbody tr").length);

for (const c of "imperatriz") {
  await p.keyboard.type(c);
  await new Promise((r) => setTimeout(r, 90));
}
await new Promise((r) => setTimeout(r, 700));

const r = await p.evaluate(() => {
  const d = window.__lat.map((x) => x.dur).sort((a, b) => a - b);
  const linhas = document.querySelectorAll("tbody tr").length;
  return {
    eventos: d.length,
    p50: d.length ? d[Math.floor(d.length * 0.5)] : null,
    p98: d.length ? d[Math.floor(d.length * 0.98)] : null,
    pior: d.length ? d[d.length - 1] : null,
    linhas,
  };
});
console.log(`  linhas antes: ${linhasAntes} → depois: ${r.linhas}`);
console.log(`  eventos medidos: ${r.eventos}`);
console.log(`  latencia  p50 ${r.p50?.toFixed(0)}ms · p98 ${r.p98?.toFixed(0)}ms · pior ${r.pior?.toFixed(0)}ms`);
console.log(`  limiar INP "bom" = 200ms  →  ${r.pior > 200 ? "REPROVA no pior caso" : "passa"}`);
await nav.close();
