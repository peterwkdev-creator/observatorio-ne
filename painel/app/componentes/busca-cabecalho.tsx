"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { slugDe } from "@/lib/fiscal";
import e from "./busca-cabecalho.module.css";

/**
 * A busca do cabeçalho — presente em todas as páginas do site.
 *
 * ## O problema que ela resolve
 *
 * Antes dela, procurar um município exigia **voltar à capa**. Quem chega de uma
 * busca externa na página de Sobral e quer ver Quixadá tinha de subir dois
 * níveis. Com 5.571 municípios, "voltar ao começo" é o caminho mais longo que
 * existe.
 *
 * ## Combobox do APG, e não `datalist`
 *
 * Implementa o padrão *Editable Combobox With List Autocomplete* do
 * [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):
 * `role="combobox"` no campo, `aria-expanded`, `aria-controls`,
 * `aria-autocomplete="list"` e `aria-activedescendant` apontando para a opção
 * em foco visual.
 *
 * **A regra que o APG enuncia e que quase toda implementação quebra: o foco do
 * DOM nunca sai do campo.** A opção "focada" é indicada por
 * `aria-activedescendant`, não por `.focus()`. Mover o foco de verdade quebra a
 * digitação — a seta para baixo passaria a navegar a lista em vez de continuar
 * o texto — e faz o leitor de tela perder o campo.
 *
 * O elemento `datalist` resolveria em três linhas e foi descartado: não se
 * estiliza, o comportamento varia entre navegadores, e o anúncio em leitor de
 * tela é inconsistente. Para um site cuja auditoria roda em dois temas,
 * entregar um controle que não responde ao tema nem ao teclado seria abrir mão
 * do padrão que o resto do site cumpre.
 *
 * ## O índice chega sob demanda
 *
 * 30 KB comprimidos, buscados **no primeiro foco**. Embutidos no HTML, seriam
 * 30 KB vezes 5.600 páginas para uma funcionalidade que a maioria das visitas
 * nunca aciona. Ver `app/dados/indice.json/route.ts`.
 *
 * ## Sem JavaScript
 *
 * O campo não funciona, e a saída está escrita ao lado: cada página de estado
 * lista **todos** os seus municípios como link, e a capa lista os 27 estados.
 * A navegação do site inteiro funciona sem JavaScript; a busca é aceleração,
 * não muleta.
 */

/**
 * `[nome, uf]` — ver a nota de formato na rota do índice.
 *
 * O slug sai de `slugDe`, **a mesma função que o build usa** para nomear a
 * pasta de cada página. Importá-la é o que torna impossível o link divergir:
 * não há duas implementações da regra, há uma.
 */
type Entrada = [string, string];

const MAXIMO = 8;

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export default function BuscaCabecalho() {
  const router = useRouter();
  const id = useId();
  const idCampo = `busca-cab-${id}`;
  const idLista = `lista-cab-${id}`;
  const opcaoId = (i: number) => `${idLista}-o${i}`;

  const [indice, setIndice] = useState<Entrada[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);

  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  /** Busca o índice uma vez. Idempotente: foco repetido não rebusca. */
  const carregar = useCallback(async () => {
    if (indice || carregando) return;
    setCarregando(true);
    setErro(false);
    try {
      const r = await fetch("/dados/indice.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setIndice((await r.json()) as Entrada[]);
    } catch (causa) {
      // Falha de rede não pode virar campo mudo: a pessoa digitaria sem
      // entender por que nada acontece. Ver a mensagem no fim do componente.
      console.error("não foi possível carregar o índice de busca", causa);
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [indice, carregando]);

  const alvo = normalizar(termo);
  const achados: Entrada[] = !alvo || !indice ? [] : procurar(indice, alvo);

  // Fecha ao clicar fora. `pointerdown` e não `click`: o clique numa opção
  // dispara depois, e com `click` a lista já teria fechado antes de escolher.
  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: PointerEvent) => {
      if (!raiz.current?.contains(ev.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  useEffect(() => setAtivo(-1), [termo]);

  function ir(x: Entrada) {
    setAberto(false);
    setTermo("");
    campo.current?.blur();
    router.push(`/municipio/${slugDe(x[0], x[1])}/`);
  }

  function teclado(ev: React.KeyboardEvent<HTMLInputElement>) {
    // Alt+Seta abre a lista SEM mover a seleção — é o que o APG especifica, e
    // é o que permite reabrir o que se fechou por engano sem perder o lugar.
    if (ev.altKey && ev.key === "ArrowDown") {
      ev.preventDefault();
      setAberto(true);
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      if (aberto) setAberto(false);
      else setTermo("");
      return;
    }
    if (!achados.length) return;

    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        setAberto(true);
        setAtivo((i) => (i + 1) % achados.length);
        break;
      case "ArrowUp":
        ev.preventDefault();
        setAberto(true);
        setAtivo((i) => (i <= 0 ? achados.length - 1 : i - 1));
        break;
      case "Home":
        if (aberto) {
          ev.preventDefault();
          setAtivo(0);
        }
        break;
      case "End":
        if (aberto) {
          ev.preventDefault();
          setAtivo(achados.length - 1);
        }
        break;
      case "Enter": {
        // Sem opção destacada, Enter leva ao primeiro resultado: é o que a
        // pessoa espera depois de digitar o nome inteiro, e evita exigir uma
        // seta antes do Enter no caso mais comum.
        const x = achados[ativo >= 0 ? ativo : 0];
        if (x) {
          ev.preventDefault();
          ir(x);
        }
        break;
      }
    }
  }

  const mostrarLista = aberto && !!alvo && !!indice;

  return (
    <search className={e.raiz}>
      <div className={e.caixa} ref={raiz}>
        <label htmlFor={idCampo} className="so-leitor">
          Buscar município
        </label>
        <svg
          className={e.lupa}
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="7"
            cy="7"
            r="4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <line
            x1="10.5"
            y1="10.5"
            x2="14"
            y2="14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          ref={campo}
          id={idCampo}
          type="text"
          className={e.campo}
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={
            mostrarLista && ativo >= 0 ? opcaoId(ativo) : undefined
          }
          aria-describedby={`${idCampo}-ajuda`}
          autoComplete="off"
          spellCheck={false}
          placeholder="Buscar município"
          value={termo}
          onFocus={() => void carregar()}
          onChange={(ev) => {
            setTermo(ev.target.value);
            setAberto(true);
            void carregar();
          }}
          onKeyDown={teclado}
        />

        <ul
          id={idLista}
          role="listbox"
          aria-label="Municípios encontrados"
          className={e.lista}
          hidden={!mostrarLista}
        >
          {achados.map((x, i) => (
            <li
              key={`${x[0]}-${x[1]}`}
              id={opcaoId(i)}
              role="option"
              aria-selected={i === ativo}
              className={i === ativo ? e.ativa : undefined}
              // `onPointerDown` e não `onClick`: o clique tiraria o foco do
              // campo antes de disparar, e a lista fecharia antes de escolher.
              onPointerDown={(ev) => {
                ev.preventDefault();
                ir(x);
              }}
              onMouseMove={() => setAtivo(i)}
            >
              <span className={e.nome}>{x[0]}</span>
              <span className={e.uf}>{x[1]}</span>
            </li>
          ))}
          {!achados.length && (
            <li className={e.vazio} role="option" aria-selected={false}>
              Nenhum município com esse nome
            </li>
          )}
        </ul>
      </div>

      {/* A contagem é anunciada, não só desenhada. `aria-atomic` explícito
          porque `role="status"` não é atômico por padrão em todo ambiente —
          ver a técnica ARIA22 do WCAG. */}
      <p className="so-leitor" role="status" aria-atomic="true">
        {erro
          ? "A busca não pôde ser carregada."
          : carregando
            ? "Carregando a busca."
            : !alvo || !indice
              ? ""
              : `${achados.length} ${
                  achados.length === 1
                    ? "município encontrado"
                    : "municípios encontrados"
                } para ${termo}.`}
      </p>

      <p id={`${idCampo}-ajuda`} className="so-leitor">
        Digite o nome e use as setas para escolher. Enter abre a página do
        município.
      </p>

      {erro && (
        <p className={e.erro} role="alert">
          Busca indisponível.{" "}
          <a href="/#municipios">Ver a lista completa</a>.
        </p>
      )}
    </search>
  );
}

/**
 * Prefixo antes de "contém".
 *
 * Quem digita "sao" quer São Paulo no topo, não "Conceição do Coité". Duas
 * listas em uma passada, e **não** um `sort` por pontuação: são 5.571 entradas
 * a cada tecla, e ordenar a cada uma é o custo que trava a digitação em
 * aparelho modesto.
 */
function procurar(indice: Entrada[], alvo: string): Entrada[] {
  const prefixo: Entrada[] = [];
  const meio: Entrada[] = [];
  for (const x of indice) {
    const n = normalizar(x[0]);
    if (n.startsWith(alvo)) {
      prefixo.push(x);
      if (prefixo.length >= MAXIMO) return prefixo;
    } else if (meio.length < MAXIMO && n.includes(alvo)) {
      meio.push(x);
    }
  }
  return [...prefixo, ...meio].slice(0, MAXIMO);
}
