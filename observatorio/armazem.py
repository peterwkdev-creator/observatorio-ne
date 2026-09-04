"""Persistência em SQLite.

Duas regras que valem para todo o esquema:

* **Procedência é coluna, não comentário.** Toda observação guarda quando foi
  coletada e de qual endpoint veio. Número sem origem rastreável não serve num
  observatório -- é o que separa isto de um scraper.
* **Revisão não sobrescreve.** O IBGE revisa PIB retroativamente; uma coleta
  nova com valor diferente vira **outra linha**, não uma sobrescrita silenciosa.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .ibge import Municipio, Observacao

ESQUEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS municipio (
    codigo      INTEGER PRIMARY KEY,          -- código IBGE, chave natural
    nome        TEXT    NOT NULL,
    uf_sigla    TEXT    NOT NULL,
    uf_nome     TEXT    NOT NULL,
    regiao      TEXT    NOT NULL,
    visto_em    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_municipio_uf ON municipio (uf_sigla);

CREATE TABLE IF NOT EXISTS indicador (
    codigo      TEXT PRIMARY KEY,             -- ex.: "populacao-censo-2022"
    nome        TEXT NOT NULL,
    unidade     TEXT NOT NULL,
    agregado    INTEGER NOT NULL,             -- o agregado do IBGE
    variavel    INTEGER NOT NULL,
    descricao   TEXT
);

-- A chave inclui `coletado_em` de propósito: quando o IBGE revisa um valor, a
-- coleta nova entra ao lado da antiga em vez de apagá-la. O histórico da FONTE
-- é tão informativo quanto o histórico do dado.
CREATE TABLE IF NOT EXISTS observacao (
    municipio    INTEGER NOT NULL REFERENCES municipio(codigo),
    indicador    TEXT    NOT NULL REFERENCES indicador(codigo),
    periodo      TEXT    NOT NULL,
    valor        REAL,
    coletado_em  TEXT    NOT NULL,
    origem       TEXT    NOT NULL,            -- o endpoint exato
    PRIMARY KEY (municipio, indicador, periodo, valor)
);
CREATE INDEX IF NOT EXISTS idx_observacao_ind ON observacao (indicador, periodo);

CREATE TABLE IF NOT EXISTS coleta (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rodou_em    TEXT    NOT NULL,
    alvo        TEXT    NOT NULL,             -- "municipios", ou o indicador
    lidos       INTEGER NOT NULL,
    novos       INTEGER NOT NULL,
    inalterados INTEGER NOT NULL,
    erro        TEXT
);
"""


def agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Armazem:
    def __init__(self, caminho: str | Path = "observatorio.db") -> None:
        self.caminho = str(caminho)
        self.con = sqlite3.connect(self.caminho)
        self.con.row_factory = sqlite3.Row
        self.con.executescript(ESQUEMA)
        self.con.commit()

    def __enter__(self) -> "Armazem":
        return self

    def __exit__(self, *_) -> None:
        self.fechar()

    def fechar(self) -> None:
        self.con.close()

    # ------------------------------------------------------------------ municípios

    def gravar_municipios(self, municipios: Iterable[Municipio]) -> tuple[int, int]:
        """Grava e devolve `(novos, inalterados)`.

        Idempotente por construção: a chave é o código IBGE. Rodar de novo
        atualiza nome e UF (município **muda de nome**, e isso é dado, não
        erro) sem criar linha nova.
        """
        visto = agora()
        novos = inalterados = 0
        with closing(self.con.cursor()) as cur:
            for m in municipios:
                atual = cur.execute(
                    "SELECT nome, uf_sigla FROM municipio WHERE codigo = ?",
                    (m.codigo,),
                ).fetchone()
                if atual is None:
                    cur.execute(
                        "INSERT INTO municipio (codigo, nome, uf_sigla, uf_nome,"
                        " regiao, visto_em) VALUES (?, ?, ?, ?, ?, ?)",
                        (m.codigo, m.nome, m.uf_sigla, m.uf_nome, m.regiao, visto),
                    )
                    novos += 1
                else:
                    if atual["nome"] != m.nome or atual["uf_sigla"] != m.uf_sigla:
                        cur.execute(
                            "UPDATE municipio SET nome = ?, uf_sigla = ?,"
                            " uf_nome = ?, regiao = ?, visto_em = ?"
                            " WHERE codigo = ?",
                            (m.nome, m.uf_sigla, m.uf_nome, m.regiao, visto,
                             m.codigo),
                        )
                    inalterados += 1
        self.con.commit()
        return novos, inalterados

    def municipios(self, uf: str | None = None) -> list[sqlite3.Row]:
        sql = "SELECT * FROM municipio"
        args: list = []
        if uf:
            sql += " WHERE uf_sigla = ?"
            args.append(uf.upper())
        sql += " ORDER BY uf_sigla, nome"
        return list(self.con.execute(sql, args))

    def contagem_por_uf(self) -> dict[str, int]:
        return {
            l["uf_sigla"]: l["quantos"]
            for l in self.con.execute(
                "SELECT uf_sigla, COUNT(*) AS quantos FROM municipio"
                " GROUP BY uf_sigla ORDER BY uf_sigla"
            )
        }

    # ------------------------------------------------------------------ indicadores

    def registrar_indicador(self, codigo: str, nome: str, unidade: str,
                            agregado: int, variavel: int,
                            descricao: str | None = None) -> None:
        """Idempotente: mesmo código, mesma linha. Nome e unidade vêm da própria
        resposta do IBGE, não digitados à mão — assim não divergem da fonte."""
        self.con.execute(
            "INSERT INTO indicador (codigo, nome, unidade, agregado, variavel,"
            " descricao) VALUES (?, ?, ?, ?, ?, ?)"
            " ON CONFLICT(codigo) DO UPDATE SET nome = excluded.nome,"
            " unidade = excluded.unidade, agregado = excluded.agregado,"
            " variavel = excluded.variavel, descricao = excluded.descricao",
            (codigo, nome, unidade, agregado, variavel, descricao),
        )
        self.con.commit()

    def indicadores(self) -> list[sqlite3.Row]:
        return list(self.con.execute("SELECT * FROM indicador ORDER BY codigo"))

    def gravar_observacoes(self, indicador: str,
                           observacoes: Iterable[Observacao]) -> tuple[int, int]:
        """Grava e devolve `(novas, inalteradas)`.

        A chave inclui o **valor**: um número revisado pelo IBGE entra ao lado do
        anterior, com `coletado_em` próprio, em vez de apagá-lo. Reingerir o
        mesmo valor não cria nada — é o que torna a operação idempotente.

        Município desconhecido é **recusado**, não gravado: a chave estrangeira
        existe para que uma observação órfã não vire um número sem lugar no mapa.
        """
        visto = agora()
        novas = inalteradas = 0
        with closing(self.con.cursor()) as cur:
            conhecidos = {l["codigo"] for l in
                          cur.execute("SELECT codigo FROM municipio")}
            for o in observacoes:
                if o.municipio not in conhecidos:
                    raise ValueError(
                        f"observação de município desconhecido ({o.municipio}); "
                        "rodar `ingerir-municipios` antes")
                cur.execute(
                    "INSERT OR IGNORE INTO observacao (municipio, indicador,"
                    " periodo, valor, coletado_em, origem)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (o.municipio, indicador, o.periodo, o.valor, visto, o.origem),
                )
                if cur.rowcount:
                    novas += 1
                else:
                    inalteradas += 1
        self.con.commit()
        return novas, inalteradas

    def observacoes(self, indicador: str, uf: str | None = None,
                    limite: int = 50) -> list[sqlite3.Row]:
        """A observação MAIS RECENTE de cada município para o indicador."""
        sql = """
            SELECT m.nome, m.uf_sigla, o.periodo, o.valor, o.coletado_em, o.origem
              FROM observacao o
              JOIN municipio m ON m.codigo = o.municipio
             WHERE o.indicador = ?
               AND o.coletado_em = (SELECT MAX(o2.coletado_em) FROM observacao o2
                                     WHERE o2.municipio = o.municipio
                                       AND o2.indicador = o.indicador
                                       AND o2.periodo = o.periodo)
        """
        args: list = [indicador]
        if uf:
            sql += " AND m.uf_sigla = ?"
            args.append(uf.upper())
        sql += " ORDER BY o.valor IS NULL, o.valor DESC LIMIT ?"
        args.append(limite)
        return list(self.con.execute(sql, args))

    def resumo_indicador(self, indicador: str) -> list[sqlite3.Row]:
        """Por UF: quantos municípios, soma e média. `NULL` não entra na conta —
        média sobre valor ausente seria média inventada."""
        return list(self.con.execute(
            "SELECT m.uf_sigla, COUNT(*) AS municipios,"
            "       COUNT(o.valor) AS com_valor,"
            "       SUM(o.valor) AS soma, AVG(o.valor) AS media"
            "  FROM observacao o JOIN municipio m ON m.codigo = o.municipio"
            " WHERE o.indicador = ? GROUP BY m.uf_sigla ORDER BY m.uf_sigla",
            (indicador,)))

    # ------------------------------------------------------------------ snapshot

    def snapshot(self) -> dict:
        """O estado atual, no formato que o painel consome.

        **Formato compacto de propósito**: municípios como lista de listas, e não
        lista de objetos. São 1.794 linhas × 3 indicadores — repetir o nome de
        cada campo em cada linha triplicaria o arquivo que o visitante baixa,
        sem acrescentar informação nenhuma.

        Cada indicador carrega `origem` e o período: **o painel não pode exibir
        um número sem poder dizer de onde ele veio.**
        """
        indicadores = []
        for ind in self.indicadores():
            recente = self.con.execute(
                "SELECT periodo, origem, MAX(coletado_em) AS coletado_em"
                "  FROM observacao WHERE indicador = ?", (ind["codigo"],)
            ).fetchone()
            total = self.con.execute(
                "SELECT SUM(valor) AS t FROM observacao WHERE indicador = ?"
                "   AND periodo = ?",
                (ind["codigo"], recente["periodo"] if recente else None),
            ).fetchone()
            indicadores.append({
                "codigo": ind["codigo"],
                "nome": ind["nome"],
                "unidade": ind["unidade"],
                "agregado": ind["agregado"],
                "variavel": ind["variavel"],
                "periodo": recente["periodo"] if recente else None,
                "origem": recente["origem"] if recente else None,
                "coletadoEm": recente["coletado_em"] if recente else None,
                "totalRegiao": total["t"] if total else None,
            })

        codigos = [i["codigo"] for i in indicadores]
        # Uma consulta só, com pivô em Python: 1.794 municípios × N indicadores
        # em consultas separadas seria N+1 sobre um banco que cabe na memória.
        valores: dict[int, dict[str, float | None]] = {}
        for l in self.con.execute(
            "SELECT o.municipio, o.indicador, o.valor, o.coletado_em"
            "  FROM observacao o"
            " WHERE o.coletado_em = (SELECT MAX(o2.coletado_em) FROM observacao o2"
            "                         WHERE o2.municipio = o.municipio"
            "                           AND o2.indicador = o.indicador)"
        ):
            valores.setdefault(l["municipio"], {})[l["indicador"]] = l["valor"]

        municipios = [
            [m["codigo"], m["nome"], m["uf_sigla"],
             *[valores.get(m["codigo"], {}).get(c) for c in codigos]]
            for m in self.municipios()
        ]

        ufs = {}
        for m in self.municipios():
            # `regiao` entra no snapshot desde a expansão nacional: com 27
            # UFs numa lista plana, o leitor procura "Ceará" varrendo a tabela
            # inteira. Agrupada por região, ele vai direto — e o dado já estava
            # no banco, só não chegava ao painel.
            ufs.setdefault(m["uf_sigla"], {"sigla": m["uf_sigla"],
                                           "nome": m["uf_nome"],
                                           "regiao": m["regiao"],
                                           "municipios": 0})
            ufs[m["uf_sigla"]]["municipios"] += 1
        for sigla, uf in ufs.items():
            uf["totais"] = {
                c: self.con.execute(
                    "SELECT SUM(o.valor) AS t FROM observacao o"
                    "  JOIN municipio m ON m.codigo = o.municipio"
                    " WHERE o.indicador = ? AND m.uf_sigla = ?", (c, sigla)
                ).fetchone()["t"]
                for c in codigos
            }

        return {
            "geradoEm": agora(),
            "fonte": "IBGE — APIs públicas de Localidades e Agregados",
            "colunas": ["codigo", "nome", "uf", *codigos],
            "indicadores": indicadores,
            "ufs": sorted(ufs.values(), key=lambda u: u["sigla"]),
            "municipios": municipios,
        }

    # ------------------------------------------------------------------ coletas

    def anotar_coleta(self, alvo: str, lidos: int, novos: int,
                      inalterados: int, erro: str | None = None) -> None:
        """Uma linha por execução -- inclusive as que falharam.

        É o que permite perceber a ingestão degradando **antes** de alguém
        notar pelo painel: uma UF que some, um agregado que muda de código.
        """
        self.con.execute(
            "INSERT INTO coleta (rodou_em, alvo, lidos, novos, inalterados, erro)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (agora(), alvo, lidos, novos, inalterados, erro),
        )
        self.con.commit()

    def coletas(self, limite: int = 20) -> list[sqlite3.Row]:
        return list(self.con.execute(
            "SELECT * FROM coleta ORDER BY id DESC LIMIT ?", (limite,)))
