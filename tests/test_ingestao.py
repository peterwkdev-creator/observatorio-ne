"""Persistência e ingestão ponta a ponta.

A prova que mais importa nesta etapa é a **idempotência**: rodar duas vezes não
pode duplicar nem alterar nada. Sem isso, um workflow agendado corrompe o banco
sozinho, em silêncio, e o estrago só aparece quando alguém olha o painel.
"""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

from observatorio.armazem import Armazem
from observatorio.cli import construir_parser, ingerir_municipios
from observatorio.ibge import Municipio, Resposta

FIXTURES = Path(__file__).parent / "fixtures"
SERGIPE = (FIXTURES / "municipios_se.json").read_text(encoding="utf-8")


def municipios_de_sergipe() -> list[Municipio]:
    return [Municipio.de_json(b) for b in json.loads(SERGIPE)]


class TestArmazemMunicipios(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = str(Path(self.tmp.name) / "obs.db")
        self.municipios = municipios_de_sergipe()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_primeira_gravacao_conta_todos_como_novos(self):
        with Armazem(self.banco) as db:
            novos, iguais = db.gravar_municipios(self.municipios)
        self.assertEqual((novos, iguais), (75, 0))

    def test_segunda_gravacao_nao_duplica_nada(self):
        with Armazem(self.banco) as db:
            db.gravar_municipios(self.municipios)
            novos, iguais = db.gravar_municipios(self.municipios)
            self.assertEqual((novos, iguais), (0, 75))
            self.assertEqual(len(db.municipios()), 75)

    def test_municipio_que_muda_de_nome_e_atualizado_no_lugar(self):
        # Município muda de nome de verdade (Mogi Mirim, Florínea...). Isso é
        # dado novo sobre a mesma entidade, não entidade nova.
        with Armazem(self.banco) as db:
            db.gravar_municipios(self.municipios)
            renomeado = [
                Municipio(m.codigo, "Nome Novo", m.uf_sigla, m.uf_nome, m.regiao)
                if m.codigo == 2800100 else m
                for m in self.municipios
            ]
            novos, iguais = db.gravar_municipios(renomeado)

            self.assertEqual((novos, iguais), (0, 75))
            self.assertEqual(len(db.municipios()), 75)
            atual = next(l for l in db.municipios() if l["codigo"] == 2800100)
            self.assertEqual(atual["nome"], "Nome Novo")

    def test_contagem_por_uf(self):
        with Armazem(self.banco) as db:
            db.gravar_municipios(self.municipios)
            self.assertEqual(db.contagem_por_uf(), {"SE": 75})

    def test_coleta_e_registrada_inclusive_com_erro(self):
        with Armazem(self.banco) as db:
            db.anotar_coleta("municipios", 75, 75, 0, erro="ErroIBGE: 500")
            linha = db.coletas()[0]
            self.assertEqual(linha["alvo"], "municipios")
            self.assertEqual(linha["lidos"], 75)
            self.assertIn("500", linha["erro"])


class TestIngestaoPontaAPonta(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = str(Path(self.tmp.name) / "obs.db")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _rodar(self, *respostas, uf="28"):
        pendentes = list(respostas)
        args = construir_parser().parse_args(
            ["--banco", self.banco, "ingerir-municipios", "--uf", uf,
             "--pausa", "0"])
        saida, erros = io.StringIO(), io.StringIO()
        with redirect_stdout(saida), redirect_stderr(erros):
            codigo = ingerir_municipios(
                args,
                transporte=lambda url: pendentes.pop(0),
                dormir=lambda _: None,
            )
        return codigo, saida.getvalue() + erros.getvalue()

    def test_ingestao_completa(self):
        codigo, saida = self._rodar(Resposta(200, SERGIPE))
        self.assertEqual(codigo, 0)
        self.assertIn("75 lidos", saida)
        self.assertIn("75 novos", saida)
        self.assertIn("SE 75", saida)
        with Armazem(self.banco) as db:
            self.assertEqual(len(db.municipios("SE")), 75)

    def test_rodar_de_novo_e_idempotente(self):
        self._rodar(Resposta(200, SERGIPE))
        codigo, saida = self._rodar(Resposta(200, SERGIPE))

        self.assertEqual(codigo, 0)
        self.assertIn("0 novos", saida)
        self.assertIn("75 já conhecidos", saida)
        with Armazem(self.banco) as db:
            self.assertEqual(len(db.municipios()), 75)
            self.assertEqual(len(db.coletas()), 2)   # as duas execuções constam

    def test_falha_da_api_registra_a_coleta_e_sai_com_erro(self):
        codigo, saida = self._rodar(*[Resposta(500, "boom")] * 4)

        self.assertEqual(codigo, 1)
        self.assertIn("interrompido", saida)
        with Armazem(self.banco) as db:
            self.assertEqual(len(db.municipios()), 0)
            linha = db.coletas()[0]
            self.assertIn("500", linha["erro"])

    def test_estrutura_inesperada_nao_grava_pela_metade(self):
        # Um registro quebrado no meio: ou entra tudo, ou nada entra — e a
        # coleta fica registrada com o erro.
        quebrado = json.loads(SERGIPE)
        del quebrado[40]["microrregiao"]
        codigo, saida = self._rodar(
            Resposta(200, json.dumps(quebrado, ensure_ascii=False)))

        self.assertEqual(codigo, 1)
        with Armazem(self.banco) as db:
            self.assertEqual(len(db.municipios()), 0)
            self.assertIn("estrutura inesperada", db.coletas()[0]["erro"])


if __name__ == "__main__":
    unittest.main()
