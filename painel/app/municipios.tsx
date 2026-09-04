"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  br, expandirLinhas, type Indicador, type LinhaMunicipio,
} from "@/lib/dados";
import { FAIXA_DA_LETRA, ROTULO_FAIXA, type Faixa } from "@/lib/fiscal";
import s from "./page.module.css";
import m from "./municipios.module.css";

/**
 * A tabela de municípios — o único componente de cliente do painel.
 *
 * Interatividade é a **única** razão de existir JavaScript aqui: buscar e
 * ordenar 1.794 linhas. Todo o resto da página é HTML gerado no build.
 *
 * Os registros já vêm no payload da página, então filtrar é síncrono e local —
 * nenhuma requisição, nenhum estado de carregamento, nenhum spinner.
 *
 * ## Recebe as linhas CRUAS, não os objetos expandidos
 *
 * Medido em 03/09/2026: com objetos expandidos, o payload da capa era 269 KB,
 * porque cada município repetia `codigo`, `nome`, `uf` e as três chaves de
 * indicador, 1.794 vezes. E como toda página linkava para a capa, o Next
 * pré-buscava esses 269 KB em todas elas.
 *
 * A expansão acontece uma vez aqui, no navegador, e custa milissegundos. O que
 * ela economiza é banda de quem visita — e é o que torna a expansão nacional
 * (5.570 municípios) viável em vez de proibitiva.
 */

const PAGINA = 50;

type Ordem = { coluna: string; desc: boolean };

/**
 * Os filtros de situação fiscal oferecidos, e por que só estes.
 *
 * As sete faixas existem no dado, mas oferecer as sete produziria um controle
 * que ninguém lê. Estas quatro são as perguntas que as pessoas de fato fazem —
 * e a última, "não entregou", é a que o site mais quer que se possa fazer:
 * são 2.326 municípios sobre os quais não se sabe nada, e sem um filtro eles
 * ficam diluídos entre os outros.
 */
const FILTROS_FAIXA: { valor: Faixa | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Todas as situações" },
  { valor: "acima-legal", rotulo: ROTULO_FAIXA["acima-legal"] },
  { valor: "acima-prudencial", rotulo: ROTULO_FAIXA["acima-prudencial"] },
  { valor: "abaixo", rotulo: ROTULO_FAIXA.abaixo },
  { valor: "sem-dado", rotulo: ROTULO_FAIXA["sem-dado"] },
];

/**
 * Faixas de população. Os cortes são os do próprio IBGE para porte municipal,
 * e não números redondos escolhidos aqui — a régua tem de ser de alguém.
 */
const PORTES: { valor: string; rotulo: string; min: number; max: number }[] = [
  { valor: "p", rotulo: "Até 20 mil habitantes", min: 0, max: 20000 },
  { valor: "m", rotulo: "20 mil a 100 mil", min: 20000, max: 100000 },
  { valor: "g", rotulo: "100 mil a 500 mil", min: 100000, max: 500000 },
  { valor: "gg", rotulo: "Mais de 500 mil", min: 500000, max: Infinity },
];

export function Municipios({
  linhas,
  indicadores,
  faixas,
}: {
  linhas: LinhaMunicipio[];
  indicadores: Indicador[];
  /**
   * Uma letra por município, na MESMA ordem de `linhas` — ver `faixasEmLinha`.
   * A ordem é o contrato: casada errado, cada município mostraria a situação
   * fiscal do vizinho, e a página continuaria bem formada.
   */
  faixas: string;
}) {
  const municipios = useMemo(
    () => expandirLinhas(linhas, indicadores.map((i) => i.codigo)),
    [linhas, indicadores],
  );
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");
  const [faixa, setFaixa] = useState<Faixa | "">("");
  const [porte, setPorte] = useState("");
  const [ordem, setOrdem] = useState<Ordem>({
    coluna: indicadores[0]?.codigo ?? "nome",
    desc: true,
  });
  const [mostrando, setMostrando] = useState(PAGINA);

  // `useDeferredValue` mantém o campo de busca responsivo enquanto a lista de
  // 1.794 linhas é refiltrada: o que o usuário digita nunca engasga.
  const buscaAdiada = useDeferredValue(busca);

  const ufs = useMemo(
    () => [...new Set(municipios.map((x) => x.uf))].sort(),
    [municipios],
  );

  const codigoPop = indicadores.find(
    (i) => i.codigo === "populacao-censo-2022",
  )?.codigo ?? indicadores[0]?.codigo ?? "";

  const filtrados = useMemo(() => {
    const termo = buscaAdiada
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
    const alvoPorte = PORTES.find((p) => p.valor === porte);
    const lista = municipios.filter((x, i) => {
      if (uf && x.uf !== uf) return false;
      // `faixas[i]` casa com `linhas[i]`, e `municipios` sai de `linhas` na
      // mesma ordem — a expansão preserva a ordem, e é o que sustenta isto.
      if (faixa && FAIXA_DA_LETRA[faixas[i] ?? ""] !== faixa) return false;
      if (alvoPorte) {
        const pop = x.valores[codigoPop];
        // Sem população conhecida fica FORA de qualquer faixa de porte:
        // colocá-la na menor seria afirmar um tamanho que não se sabe.
        if (pop == null || pop < alvoPorte.min || pop >= alvoPorte.max) {
          return false;
        }
      }
      if (!termo) return true;
      return x.nome
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .includes(termo);
    });
    return [...lista].sort((a, b) => {
      if (ordem.coluna === "nome") {
        return ordem.desc
          ? b.nome.localeCompare(a.nome, "pt-BR")
          : a.nome.localeCompare(b.nome, "pt-BR");
      }
      const va = a.valores[ordem.coluna];
      const vb = b.valores[ordem.coluna];
      // Ausente sempre no fim, independente da direção: "não sabemos" não é
      // um valor pequeno nem grande.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return ordem.desc ? vb - va : va - vb;
    });
  }, [municipios, buscaAdiada, uf, faixa, porte, faixas, codigoPop, ordem]);

  function ordenarPor(coluna: string) {
    setOrdem((atual) =>
      atual.coluna === coluna
        ? { coluna, desc: !atual.desc }
        : { coluna, desc: true },
    );
    setMostrando(PAGINA);
  }

  /** Os filtros em vigor, com o rótulo que a pessoa reconhece e como desfazer. */
  const ativos = [
    busca && { chave: "busca", rotulo: `“${busca}”`, limpar: () => setBusca("") },
    uf && { chave: "uf", rotulo: `Estado: ${uf}`, limpar: () => setUf("") },
    faixa && {
      chave: "faixa",
      rotulo: ROTULO_FAIXA[faixa],
      limpar: () => setFaixa(""),
    },
    porte && {
      chave: "porte",
      rotulo: PORTES.find((x) => x.valor === porte)?.rotulo ?? porte,
      limpar: () => setPorte(""),
    },
  ].filter(Boolean) as { chave: string; rotulo: string; limpar: () => void }[];

  const visiveis = filtrados.slice(0, mostrando);

  return (
    <section className={s.secao} aria-labelledby="municipios">
      <h2 className={s.secaoTitulo} id="municipios">
        Municípios
      </h2>
      <p className={s.secaoNota}>
        Busque por nome, ou filtre por estado, situação fiscal e porte. Os
        filtros se somam, e a lista atualiza sozinha. Clique no cabeçalho de uma
        coluna para ordenar — municípios sem valor na fonte ficam sempre no fim.
      </p>

      <div className={m.controles}>
        <div className={m.campo}>
          <label htmlFor="busca">Buscar município</label>
          <input
            id="busca"
            type="search"
            value={busca}
            placeholder="ex.: Acari"
            autoComplete="off"
            onChange={(e) => {
              setBusca(e.target.value);
              setMostrando(PAGINA);
            }}
          />
        </div>
        <div className={m.campo}>
          <label htmlFor="uf">Estado</label>
          <select
            id="uf"
            value={uf}
            onChange={(e) => {
              setUf(e.target.value);
              setMostrando(PAGINA);
            }}
          >
            <option value="">Todos</option>
            {ufs.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className={m.campo}>
          <label htmlFor="faixa">Situação fiscal</label>
          <select
            id="faixa"
            value={faixa}
            onChange={(ev) => {
              setFaixa(ev.target.value as Faixa | "");
              setMostrando(PAGINA);
            }}
          >
            {FILTROS_FAIXA.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className={m.campo}>
          <label htmlFor="porte">Porte</label>
          <select
            id="porte"
            value={porte}
            onChange={(ev) => {
              setPorte(ev.target.value);
              setMostrando(PAGINA);
            }}
          >
            <option value="">Qualquer porte</option>
            {PORTES.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.rotulo}
              </option>
            ))}
          </select>
        </div>

        {/* A contagem traz o TOTAL junto: "38 municípios" sozinho não diz se o
            filtro cortou muito ou pouco, e é essa proporção que informa.
            `aria-atomic` explícito — `role="status"` não é atômico por padrão
            em todo ambiente (técnica ARIA22 do WCAG). */}
        <p
          className={m.contagem}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>{br(filtrados.length)}</strong>{" "}
          {filtrados.length === 1 ? "município" : "municípios"}
          {filtrados.length !== municipios.length && (
            <> de {br(municipios.length)}</>
          )}
        </p>
      </div>

      {/* Os filtros aplicados, visíveis e removíveis um a um — o padrão de
          filtro de busca do GOV.UK. Sem isto, quem rolou a página não vê mais
          os controles e não entende por que a lista está curta; e desfazer
          exige achar o `select` certo de novo. */}
      {ativos.length > 0 && (
        <div className={m.aplicados}>
          <span className={m.aplicadosRotulo}>Filtros aplicados:</span>
          <ul>
            {ativos.map((f) => (
              <li key={f.chave}>
                <button
                  type="button"
                  className={m.remover}
                  onClick={() => {
                    f.limpar();
                    setMostrando(PAGINA);
                  }}
                >
                  {f.rotulo}
                  <span aria-hidden="true"> ×</span>
                  <span className="so-leitor"> — remover este filtro</span>
                </button>
              </li>
            ))}
          </ul>
          {ativos.length > 1 && (
            <button
              type="button"
              className={m.limparTudo}
              onClick={() => {
                setBusca("");
                setUf("");
                setFaixa("");
                setPorte("");
                setMostrando(PAGINA);
              }}
            >
              Limpar tudo
            </button>
          )}
        </div>
      )}

      <div className={s.rolagem}>
        <table className={s.tabela}>
          <thead>
            <tr>
              <th scope="col" aria-sort={aria(ordem, "nome")}>
                <button
                  type="button"
                  className={m.ordenar}
                  onClick={() => ordenarPor("nome")}
                >
                  Município {seta(ordem, "nome")}
                </button>
              </th>
              <th scope="col">UF</th>
              {indicadores.map((i) => (
                <th
                  key={i.codigo}
                  scope="col"
                  className={s.numero}
                  aria-sort={aria(ordem, i.codigo)}
                >
                  <button
                    type="button"
                    className={`${m.ordenar} ${m.ordenarNumero}`}
                    onClick={() => ordenarPor(i.codigo)}
                  >
                    {i.nome} {seta(ordem, i.codigo)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((x) => (
              <tr key={x.codigo}>
                <th scope="row">{x.nome}</th>
                <td>{x.uf}</td>
                {indicadores.map((i) => (
                  <td
                    key={i.codigo}
                    className={`${s.numero} tabular ${
                      x.valores[i.codigo] == null ? s.ausente : ""
                    }`}
                  >
                    {br(x.valores[i.codigo])}
                  </td>
                ))}
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={2 + indicadores.length} className={m.vazio}>
                  {/* Os rótulos vão como estão, sem `toLowerCase()`: ele
                      transformava "Estado: CE" em "estado: ce", e sigla em
                      minúscula deixa de ser sigla. */}
                  Nenhum município combina{" "}
                  {ativos.map((f) => f.rotulo).join(" + ")}. Remova um filtro
                  acima para alargar a busca.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mostrando < filtrados.length && (
        <button
          type="button"
          className={m.maisBotao}
          onClick={() => setMostrando((n) => n + PAGINA)}
        >
          Mostrar mais {Math.min(PAGINA, filtrados.length - mostrando)} de{" "}
          {br(filtrados.length - mostrando)} restantes
        </button>
      )}
    </section>
  );
}

/** `aria-sort` só no cabeçalho ativo — é o que leitor de tela anuncia. */
function aria(ordem: Ordem, coluna: string): "ascending" | "descending" | "none" {
  if (ordem.coluna !== coluna) return "none";
  return ordem.desc ? "descending" : "ascending";
}

function seta(ordem: Ordem, coluna: string) {
  if (ordem.coluna !== coluna) return null;
  return <span aria-hidden="true">{ordem.desc ? "↓" : "↑"}</span>;
}
