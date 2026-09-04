/**
 * Testes das duas bibliotecas puras do painel.
 *
 * Roda no `node:test`, que vem com o Node, sobre TypeScript que o próprio Node
 * remove — **zero dependência**, como o `stack.md` cobra. O resto do painel se
 * verifica por fora (`npm run auditar` contra o HTML gerado, `conferir-xlsx`
 * abrindo a planilha no LibreOffice); aqui ficam só as funções cujo erro é
 * silencioso e aritmético, que nenhuma das duas pegaria.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";

import { concorda, descricaoDe, fracaoDe } from "../lib/dados.ts";
import {
  funcoesDoPais, mediana, panoramaEstados, posicaoNaLista,
} from "../lib/nacional.ts";
import {
  faixaDe, faixasEmLinha, FAIXA_DA_LETRA, LETRA_FAIXA,
  PRESTA_COMO_ESTADO, ROTULO_FAIXA,
} from "../lib/fiscal.ts";
import { posicaoEntre, posicaoNoEstado } from "../lib/posicao.ts";
import { xlsx } from "../lib/xlsx.ts";

// ------------------------------------------------------------------ posicao

test("posicaoEntre situa o valor entre os comparáveis", () => {
  const p = posicaoEntre(50, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.ok(p);
  assert.equal(p.base, 10);
  assert.equal(p.mediana, 55);
});

test("quem não entregou não conta — e não vira zero", () => {
  // `null` é "não entregou". Tratá-lo como 0 poria o município no fim da fila
  // POR NÃO TER PRESTADO CONTAS, que é o inverso da verdade.
  const valores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const com = posicaoEntre(50, [...valores, null, null, null]);
  const sem = posicaoEntre(50, valores);
  assert.deepEqual(com?.base, sem?.base);
  assert.deepEqual(com?.mediana, sem?.mediana);
});

test("percentual implausível não empurra os outros um degrau", () => {
  const valores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const p = posicaoEntre(50, [...valores, 371]);
  assert.equal(p?.base, 10, "371% é erro de preenchimento, não um município caro");
});

test("abaixo de 10 comparáveis não há distribuição, e o certo é dizer isso", () => {
  assert.equal(posicaoEntre(50, [10, 20, 30, 40, 50, 60, 70, 80, 90]), null);
});

test("sem percentual próprio não há posição", () => {
  assert.equal(posicaoEntre(null, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]), null);
});

// --------------------------------------------------------------------- xlsx

/** Descomprime uma entrada do ZIP. Ver `scripts/conferir-xlsx.mjs`. */
function entrada(buf: Buffer, alvo: string): string {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(fim + 16);
  for (let i = 0; i < buf.readUInt16LE(fim + 10); i += 1) {
    const tn = buf.readUInt16LE(p + 28);
    const nome = buf.toString("utf-8", p + 46, p + 46 + tn);
    if (nome === alvo) {
      const d = buf.readUInt32LE(p + 42);
      const ini = d + 30 + buf.readUInt16LE(d + 26) + buf.readUInt16LE(d + 28);
      return inflateRawSync(
        buf.subarray(ini, ini + buf.readUInt32LE(p + 20)),
      ).toString("utf-8");
    }
    p += 46 + tn + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  throw new Error(`${alvo} não está no pacote`);
}

test("a 27ª coluna é AA, e não AZ nem BA", () => {
  // Errar a base 26 desloca a planilha inteira a partir da 27ª coluna, em
  // silêncio: o arquivo abre, e os números ficam sob os cabeçalhos errados.
  const linha = Array.from({ length: 55 }, (_, i) => `c${i}`);
  const xml = entrada(xlsx([{ nome: "T", linhas: [linha] }]), "xl/worksheets/sheet1.xml");
  for (const [i, esperado] of [[0, "A1"], [25, "Z1"], [26, "AA1"], [27, "AB1"],
                               [51, "AZ1"], [52, "BA1"]] as const) {
    assert.ok(xml.includes(`r="${esperado}"`), `coluna ${i} devia ser ${esperado}`);
  }
});

test("número sai como número; texto, como texto", () => {
  const xml = entrada(
    xlsx([{ nome: "T", linhas: [["cab"], [42, "quarenta e dois"]] }]),
    "xl/worksheets/sheet1.xml",
  );
  assert.ok(xml.includes("<v>42</v>"), "o número virou texto — a soma não fecharia");
  assert.ok(xml.includes('t="inlineStr"'), "o texto perdeu o tipo");
});

test("célula vazia é AUSÊNCIA: não vira zero nem string vazia", () => {
  const xml = entrada(
    xlsx([{ nome: "T", linhas: [["a", "b"], [null, 7]] }]),
    "xl/worksheets/sheet1.xml",
  );
  assert.ok(!xml.includes('r="A2"'), "a ausência ganhou uma célula");
  assert.ok(xml.includes('r="B2"'), "a célula seguinte se perdeu junto");
});

test("o styles.xml existe — sem ele o Excel recusa o arquivo inteiro", () => {
  const buf = xlsx([{ nome: "T", linhas: [["a"]] }]);
  assert.ok(entrada(buf, "xl/styles.xml").includes("styleSheet"));
});

test("dois builds do mesmo dado dão bytes idênticos", () => {
  // A data do ZIP é fixa de propósito: com a data corrente, um `git diff` do
  // artefato deixaria de significar alguma coisa.
  const um = xlsx([{ nome: "T", linhas: [["a", 1]] }]);
  const outro = xlsx([{ nome: "T", linhas: [["a", 1]] }]);
  assert.ok(um.equals(outro));
});

test("caractere de XML no dado não quebra o pacote", () => {
  const xml = entrada(
    xlsx([{ nome: "T", linhas: [["a"], ['Saúde & <Educação> "básica"']] }]),
    "xl/worksheets/sheet1.xml",
  );
  assert.ok(xml.includes("&amp;") && xml.includes("&lt;"));
});

// ---------------------------------------------------------------- descricao

test("a cauda entra quando cabe inteira", () => {
  const d = descricaoDe("Principal.", "Cauda.", 155);
  assert.equal(d, "Principal. Cauda.");
});

test("a cauda é DESCARTADA, não cortada", () => {
  // Ela é idêntica em todas as páginas: é a parte com menos valor de
  // diferenciação, e portanto a que deve ceder primeiro. Cortá-la produzia
  // "do Tesouro Nacional e do…", que parece erro e gasta o pouco que sobrava.
  const principal = "a".repeat(100);
  const d = descricaoDe(principal, "b".repeat(100), 155);
  assert.equal(d, principal);
  assert.ok(!d.includes("…"));
});

test("só o principal excedendo é que se corta — e no espaço, nunca no meio da palavra", () => {
  const d = descricaoDe("palavra ".repeat(30).trim(), "cauda", 40);
  assert.ok(d.endsWith("…"));
  assert.ok(!d.includes(" …"), "sobrou espaço antes das reticências");
  assert.ok(d.length <= 40);
  assert.ok(d.slice(0, -1).split(" ").every((w) => w === "palavra"),
            "cortou no meio de uma palavra");
});

test("principal sem espaço nenhum ainda respeita o limite", () => {
  const d = descricaoDe("x".repeat(200), "cauda", 40);
  assert.ok(d.length <= 40);
});

// -------------------------------------------------------------------- faixas

const LIMITES = { legal: 54, prudencial: 51.3 };

test("quem presta contas como estado NÃO é marcado como faltoso", () => {
  // O Distrito Federal entrega o Anexo 01 na esfera estadual — conferido na
  // fonte, 215 itens. Marcá-lo "sem relatório entregue" é acusar de não
  // prestar contas quem presta, e foi o que o site fez até 04/09/2026.
  const df = 5300108;
  assert.ok(PRESTA_COMO_ESTADO.has(df));
  assert.equal(faixaDe(null, null, LIMITES, false, df), "como-estado");
  // e mesmo se a coleta o marcasse de qualquer outro jeito
  assert.equal(faixaDe(null, null, LIMITES, null, df), "como-estado");
  assert.equal(faixaDe(45, 51.3, LIMITES, true, df), "como-estado");
});

test("um município comum não é afetado pela exceção", () => {
  const comum = 3550308; // São Paulo
  assert.equal(faixaDe(null, null, LIMITES, false, comum), "sem-dado");
  assert.equal(faixaDe(null, null, LIMITES, null, comum), "nao-consultado");
  assert.equal(faixaDe(45, 51.3, LIMITES, true, comum), "abaixo");
  assert.equal(faixaDe(52, 51.3, LIMITES, true, comum), "acima-prudencial");
  assert.equal(faixaDe(60, 51.3, LIMITES, true, comum), "acima-legal");
  assert.equal(faixaDe(371, 51.3, LIMITES, true, comum), "implausivel");
});

test("sem código, o comportamento é o de antes", () => {
  // `codigo` é opcional: quem não o passa não pode receber a faixa nova por
  // acidente, e quem passa não muda de resposta para os demais municípios.
  assert.equal(faixaDe(null, null, LIMITES, false), "sem-dado");
});

test("toda faixa tem rótulo — inclusive a nova", () => {
  // `Record<Faixa, string>` já obriga isso no TypeScript, mas o rótulo vazio
  // passaria: é ele que sai na planilha e no CSV de quem baixa.
  for (const [faixa, rotulo] of Object.entries(ROTULO_FAIXA)) {
    assert.ok(rotulo.length > 3, `faixa ${faixa} sem rótulo utilizável`);
  }
});

// ------------------------------------------------- faixas em linha (busca)

/** O mínimo que `indexarFiscal` lê. */
const fiscalDe = (municipios: unknown[][]) => ({
  limites: LIMITES,
  municipios,
}) as never;

test("a string de faixas casa POSIÇÃO a POSIÇÃO com as linhas", () => {
  // A ordem é o contrato. Se ela escorregar, cada município exibe a situação
  // fiscal do vizinho — e a página continua bem formada, que é o que torna
  // este defeito invisível sem um teste.
  const linhas = [[1], [2], [3], [4]];
  const fiscal = fiscalDe([
    [1, "", "", null, true, 45, 51.3, null, null],   // abaixo
    [2, "", "", null, true, 60, 51.3, null, null],   // acima do legal
    [3, "", "", null, false, null, null, null, null], // não entregou
    [4, "", "", null, true, 52, 51.3, null, null],   // acima do prudencial
  ]);
  assert.equal(faixasEmLinha(linhas, fiscal), "alsp");
});

test("município ausente do snapshot fiscal vira 'não consultado', não 'não entregou'", () => {
  // O primeiro é afirmação sobre nós; o segundo, sobre ele. Trocá-los acusa
  // de não prestar contas quem nunca foi perguntado.
  const faixas = faixasEmLinha([[99]], fiscalDe([]));
  assert.equal(faixas, LETRA_FAIXA["nao-consultado"]);
  assert.notEqual(faixas, LETRA_FAIXA["sem-dado"]);
});

test("o Distrito Federal sai como 'como-estado' também na string", () => {
  assert.equal(
    faixasEmLinha([[5300108]], fiscalDe([
      [5300108, "", "", null, false, null, null, null, null],
    ])),
    LETRA_FAIXA["como-estado"],
  );
});

test("toda faixa tem uma letra, e toda letra volta à sua faixa", () => {
  // A letra viaja até o navegador e é traduzida de volta lá. Uma faixa nova
  // sem letra viraria `undefined` no filtro — silenciosamente sem resultado.
  const letras = Object.values(LETRA_FAIXA);
  assert.equal(new Set(letras).size, letras.length, "duas faixas com a mesma letra");
  for (const [faixa, letra] of Object.entries(LETRA_FAIXA)) {
    assert.equal(letra.length, 1, `a letra de ${faixa} não tem 1 caractere`);
    assert.equal(FAIXA_DA_LETRA[letra], faixa);
  }
  assert.equal(Object.keys(LETRA_FAIXA).length, Object.keys(ROTULO_FAIXA).length);
});

// ----------------------------------------------------------- panorama nacional

test("a mediana de lista vazia é null, nunca zero", () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([5]), 5);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([3, 1, 2]), 2, "não ordenou antes de tirar o meio");
});

test("o panorama não conta como faltoso quem presta contas como estado", () => {
  // O DF sai das DUAS contas: nem no denominador nem entre os que faltaram.
  // Contá-lo derrubaria a taxa de entrega de uma unidade inteira para 0%.
  const fiscal = {
    limites: LIMITES,
    municipios: [
      [5300108, "Brasília", "DF", null, false, null, null, null, null],
      [3550308, "São Paulo", "SP", null, true, 40, 51.3, null, null],
      [3509502, "Campinas", "SP", null, false, null, null, null, null],
    ],
  } as never;
  const p = panoramaEstados(fiscal);
  assert.equal(p.find((x) => x.uf === "DF"), undefined,
    "o DF entrou no panorama sem ter relatório municipal para comparar");
  const sp = p.find((x) => x.uf === "SP")!;
  assert.equal(sp.municipios, 2);
  assert.equal(sp.publicaram, 1);
  assert.equal(sp.taxa, 50);
});

test("o implausível não entra na mediana do estado", () => {
  const municipios = Array.from({ length: 12 }, (_, i) => [
    1000 + i, `M${i}`, "XX", null, true, 40 + i, 51.3, null, null,
  ]);
  const semErro = panoramaEstados({ limites: LIMITES, municipios } as never)[0]!;
  const comErro = panoramaEstados({
    limites: LIMITES,
    municipios: [...municipios, [9999, "Erro", "XX", null, true, 371, 51.3, null, null]],
  } as never)[0]!;
  assert.equal(semErro.mediana, comErro.mediana,
    "371% deslocou a mediana do estado — é erro de preenchimento, não gasto");
  assert.equal(comErro.base, semErro.base);
});

test("abaixo de 10 comparáveis o estado não ganha mediana", () => {
  const poucos = Array.from({ length: 9 }, (_, i) => [
    2000 + i, `P${i}`, "YY", null, true, 45, 51.3, null, null,
  ]);
  assert.equal(panoramaEstados({ limites: LIMITES, municipios: poucos } as never)[0]!.mediana,
    null, "9 municípios não descrevem um estado");
});

test("posicaoNaLista conta quem está estritamente abaixo", () => {
  // Empate NÃO conta como "abaixo": dois estados com a mesma taxa não estão um
  // acima do outro, e afirmar que estão inventa uma ordem.
  assert.deepEqual(posicaoNaLista(50, [10, 50, 50, 90]), { abaixo: 1, de: 4 });
  assert.deepEqual(posicaoNaLista(10, [10, 50]), { abaixo: 0, de: 2 });
});

// ------------------------------------------------------- funções no país

test("o país soma valores absolutos, não médias de percentual", () => {
  // Se somasse percentuais, um município de 3 mil habitantes pesaria o mesmo
  // que São Paulo na composição do gasto do Brasil.
  const fiscal = {
    limites: LIMITES,
    municipios: [],
    funcoes: {
      exercicio: 2024, periodo: 6,
      rotulos: ["Educação", "Saúde"],
      porMunicipio: {
        // um grande: 900 em Educação, 100 em Saúde
        "1": [1000, [[0, 900], [1, 100]]],
        // um pequeno com a proporção INVERSA: 1 e 9
        "2": [10, [[0, 1], [1, 9]]],
      },
    },
  } as never;
  const p = funcoesDoPais(fiscal)!;
  assert.equal(p.total, 1010);
  assert.equal(p.municipios, 2);
  // Educação: 901 de 1010 = 89,2%. Pela média das fatias daria 90% e 10%
  // trocados de lugar entre os dois — a proporção do pequeno pesaria igual.
  assert.equal(p.fatias[0]!.nome, "Educação");
  assert.ok(Math.abs(p.fatias[0]!.percentual! - 89.207) < 0.01);
});

test("rótulo faltante não imprime 'undefined' na página", () => {
  const fiscal = {
    limites: LIMITES, municipios: [],
    funcoes: {
      exercicio: 2024, periodo: 6,
      rotulos: ["Educação"],
      porMunicipio: { "1": [100, [[0, 60], [7, 40]]] },
    },
  } as never;
  const p = funcoesDoPais(fiscal)!;
  const orfa = p.fatias.find((f) => f.nome !== "Educação")!;
  assert.equal(orfa.nome, "Função 7");
  assert.ok(!orfa.nome.includes("undefined"));
});

test("sem bloco de funções, o país é null — não um total zerado", () => {
  assert.equal(funcoesDoPais({ limites: LIMITES, municipios: [] } as never), null);
});

// ------------------------------------------------------------- IndexNow

test("a chave do IndexNow no script é EXATAMENTE a do arquivo público", () => {
  // O protocolo compara as duas. Divergindo, toda submissão volta 403 — e o
  // 403 só aparece quando alguém roda o envio, que pode ser semanas depois de
  // a divergência entrar. É o tipo de defeito que não dói onde nasce.
  const script = fs.readFileSync("scripts/indexnow.mjs", "utf-8");
  const noScript = script.match(/^const CHAVE = "([^"]+)";$/m)?.[1];
  assert.ok(noScript, "não achei a constante CHAVE no script");

  const arquivo = `public/${noScript}.txt`;
  assert.ok(fs.existsSync(arquivo),
    `o arquivo público da chave não existe: ${arquivo}`);

  const conteudo = fs.readFileSync(arquivo, "utf-8");
  assert.equal(conteudo, noScript,
    "o conteúdo do arquivo difere da chave — inclusive quebra de linha no fim conta");
  // A regra do protocolo: 8 a 128 caracteres, só letras, números e hífen.
  assert.match(noScript, /^[a-zA-Z0-9-]{8,128}$/);
});

// ---------------------------------------------------- posição no estado

test("posicaoNoEstado situa sem classificar", () => {
  const p = posicaoNoEstado(30, [10, 20, 30, 40, 50]);
  assert.deepEqual(p, { abaixo: 2, de: 5, mediana: 30 });
});

test("quem não tem o valor fica FORA da conta, não no fim", () => {
  // Não saber a população de um município não o torna o menor do estado, e um
  // denominador que inclui desconhecidos descreve outra coisa.
  const com = posicaoNoEstado(30, [10, 20, 30, 40, 50, null, null, undefined]);
  const sem = posicaoNoEstado(30, [10, 20, 30, 40, 50]);
  assert.deepEqual(com, sem);
});

test("abaixo do mínimo não há posição — o Distrito Federal tem um município", () => {
  assert.equal(posicaoNoEstado(30, [30]), null);
  assert.equal(posicaoNoEstado(30, [10, 20, 30, 40]), null);
  assert.ok(posicaoNoEstado(30, [10, 20, 30, 40, 50]));
});

test("sem valor próprio não há posição", () => {
  assert.equal(posicaoNoEstado(null, [10, 20, 30, 40, 50]), null);
  assert.equal(posicaoNoEstado(undefined, [10, 20, 30, 40, 50]), null);
  assert.equal(posicaoNoEstado(NaN, [10, 20, 30, 40, 50]), null);
});

test("empate não conta como estar acima", () => {
  assert.equal(posicaoNoEstado(30, [30, 30, 30, 30, 30])!.abaixo, 0);
});

// ------------------------------------------------------------ concordância

test("um estado com UM município não vira \"1 dos 1 municípios\"", () => {
  // O Distrito Federal tem um município, e a concordância singular mordeu TRÊS
  // vezes em 04/09/2026 — "Os 1 municípios", "0 de 0 que entregaram", "1 dos 1
  // municípios não têm". Cada uma foi remendada onde apareceu; a seguinte
  // apareceu em outro lugar. Este teste é o que impede a quarta.
  assert.equal(fracaoDe(1, 1), "o único município");
  assert.equal(fracaoDe(0, 1), "nenhum município");
  assert.equal(concorda(1, 1, "não tem", "não têm"), "não tem");
});

test("a fração comum sai no plural", () => {
  assert.equal(fracaoDe(388, 399), "388 dos 399 municípios");
  assert.equal(concorda(388, 399, "não tem", "não têm"), "não têm");
});

test("um entre muitos usa \"de\", não \"dos\"", () => {
  assert.equal(fracaoDe(1, 497), "1 de 497 municípios");
  assert.equal(concorda(1, 497, "não tem", "não têm"), "não tem");
});

test("o substantivo é parametrizável e pluraliza junto", () => {
  assert.equal(fracaoDe(3, 27, "estado"), "3 dos 27 estados");
  assert.equal(fracaoDe(1, 1, "estado"), "o único estado");
});
