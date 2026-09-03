"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { br, type Indicador, type Municipio } from "@/lib/dados";
import s from "./page.module.css";
import m from "./municipios.module.css";

/**
 * A tabela de municípios — o único componente de cliente do painel.
 *
 * Interatividade é a **única** razão de existir JavaScript aqui: buscar e
 * ordenar 1.794 linhas. Todo o resto da página é HTML gerado no build.
 *
 * Os 1.794 registros já vêm no payload da página, então filtrar é síncrono e
 * local — nenhuma requisição, nenhum estado de carregamento, nenhum spinner.
 */

const PAGINA = 50;

type Ordem = { coluna: string; desc: boolean };

export function Municipios({
  municipios,
  indicadores,
}: {
  municipios: Municipio[];
  indicadores: Indicador[];
}) {
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");
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

  const filtrados = useMemo(() => {
    const termo = buscaAdiada
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
    const lista = municipios.filter(
      (x) =>
        (!uf || x.uf === uf) &&
        (!termo ||
          x.nome
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLowerCase()
            .includes(termo)),
    );
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
  }, [municipios, buscaAdiada, uf, ordem]);

  function ordenarPor(coluna: string) {
    setOrdem((atual) =>
      atual.coluna === coluna
        ? { coluna, desc: !atual.desc }
        : { coluna, desc: true },
    );
    setMostrando(PAGINA);
  }

  const visiveis = filtrados.slice(0, mostrando);

  return (
    <section className={s.secao} aria-labelledby="municipios">
      <h2 className={s.secaoTitulo} id="municipios">
        Municípios
      </h2>
      <p className={s.secaoNota}>
        Busque por nome ou filtre por estado. Clique no cabeçalho de uma coluna
        para ordenar — municípios sem valor na fonte ficam sempre no fim.
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
        <p className={m.contagem} role="status" aria-live="polite">
          {br(filtrados.length)}{" "}
          {filtrados.length === 1 ? "município" : "municípios"}
        </p>
      </div>

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
                  Nenhum município encontrado para “{busca}”
                  {uf ? ` em ${uf}` : ""}.
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
