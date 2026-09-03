"""Cliente do IBGE, contra a resposta real de Sergipe (75 municípios).

Nenhum teste toca a rede e nenhum espera de verdade: transporte e relógio são
injetados. É o que mantém a suíte em milissegundos e torna a política de
backoff **verificável**, em vez de "confie que dorme".
"""

from __future__ import annotations

import gzip
import io
import json
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from observatorio.ibge import (
    ErroIBGE,
    FALHA_DE_REDE,
    Municipio,
    Resposta,
    buscar_json,
    municipios,
    transporte_http,
    url_municipios_da_uf,
)

FIXTURES = Path(__file__).parent / "fixtures"
SERGIPE = (FIXTURES / "municipios_se.json").read_text(encoding="utf-8")


class RelogioFalso:
    def __init__(self) -> None:
        self.esperas: list[float] = []

    def __call__(self, segundos: float) -> None:
        self.esperas.append(segundos)


class TransporteRoteirizado:
    def __init__(self, *respostas: Resposta) -> None:
        self.respostas = list(respostas)
        self.urls: list[str] = []

    def __call__(self, url: str) -> Resposta:
        self.urls.append(url)
        if not self.respostas:
            raise AssertionError(f"requisição inesperada: {url}")
        return self.respostas.pop(0)


class TestTransporteNaoLevantaPorRede(unittest.TestCase):
    """O transporte devolve status; nunca interrompe. Sem isso, a política de
    repetição não chega a ser consultada."""

    def _resposta(self, excecao):
        with patch("urllib.request.urlopen", side_effect=excecao):
            return transporte_http(timeout=1)("https://exemplo/x")

    def test_timeout_de_socket_vira_status(self):
        # `TimeoutError` é OSError, não URLError — o buraco clássico.
        r = self._resposta(TimeoutError("read timed out"))
        self.assertEqual(r.status, FALHA_DE_REDE)
        self.assertIn("TimeoutError", r.corpo)

    def test_dns_ou_conexao_recusada_tambem(self):
        r = self._resposta(urllib.error.URLError("nome não resolve"))
        self.assertEqual(r.status, FALHA_DE_REDE)

    def test_erro_http_preserva_o_codigo(self):
        erro = urllib.error.HTTPError("https://exemplo/x", 500, "Server Error",
                                      {}, io.BytesIO(b"boom"))
        r = self._resposta(erro)
        self.assertEqual(r.status, 500)
        self.assertEqual(r.corpo, "boom")


class TestRespostaGzip(unittest.TestCase):
    """A armadilha do IBGE: a malha volta comprimida, e um cliente que não
    descomprime estoura com `UnicodeDecodeError` no byte 0x8b — erro que não
    fala de gzip e manda investigar o lado errado."""

    def test_corpo_gzip_e_descomprimido(self):
        conteudo = json.dumps({"type": "FeatureCollection"}).encode()
        comprimido = gzip.compress(conteudo)

        class RespostaFalsa:
            status = 200
            headers = {"Content-Encoding": "gzip"}
            def read(self):
                return comprimido
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False

        with patch("urllib.request.urlopen", return_value=RespostaFalsa()):
            r = transporte_http()("https://exemplo/malha")
        self.assertEqual(r.status, 200)
        self.assertEqual(json.loads(r.corpo)["type"], "FeatureCollection")

    def test_corpo_sem_gzip_continua_funcionando(self):
        class RespostaFalsa:
            status = 200
            headers = {}
            def read(self):
                return b'{"ok": true}'
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False

        with patch("urllib.request.urlopen", return_value=RespostaFalsa()):
            r = transporte_http()("https://exemplo/x")
        self.assertEqual(json.loads(r.corpo), {"ok": True})


class TestBackoff(unittest.TestCase):
    def test_repete_com_espera_dobrando_e_vence(self):
        relogio = RelogioFalso()
        t = TransporteRoteirizado(
            Resposta(FALHA_DE_REDE, "TimeoutError"),
            Resposta(503, "indisponivel"),
            Resposta(200, SERGIPE),
        )
        dados = buscar_json(t, "https://exemplo/x", dormir=relogio)
        self.assertEqual(len(dados), 75)
        self.assertEqual(relogio.esperas, [2.0, 4.0])

    def test_desiste_e_a_mensagem_aponta_a_causa_provavel(self):
        # O IBGE devolve 500 para agregado/variável inexistente. A mensagem
        # tem de mandar suspeitar disso antes de suspeitar da rede.
        t = TransporteRoteirizado(*[Resposta(500, "")] * 4)
        with self.assertRaises(ErroIBGE) as ctx:
            buscar_json(t, "https://exemplo/x", dormir=RelogioFalso())
        self.assertIn("agregado/variável inexistente", str(ctx.exception))

    def test_404_nao_e_repetido(self):
        t = TransporteRoteirizado(Resposta(404, "nao existe"))
        with self.assertRaises(ErroIBGE):
            buscar_json(t, "https://exemplo/x", dormir=RelogioFalso())
        self.assertEqual(len(t.urls), 1)


class TestMunicipioDeJson(unittest.TestCase):
    def test_achata_a_estrutura_aninhada_do_ibge(self):
        bruto = json.loads(SERGIPE)[0]
        m = Municipio.de_json(bruto)
        self.assertEqual(m.codigo, 2800100)
        self.assertEqual(m.nome, "Amparo do São Francisco")
        self.assertEqual(m.uf_sigla, "SE")
        self.assertEqual(m.regiao, "Nordeste")

    def test_estrutura_inesperada_falha_dizendo_qual_registro(self):
        # Gravar município sem UF e descobrir no painel é pior que falhar aqui.
        with self.assertRaises(ErroIBGE) as ctx:
            Municipio.de_json({"id": 1, "nome": "Sem UF"})
        self.assertIn("Sem UF", str(ctx.exception))


class TestMunicipios(unittest.TestCase):
    def test_uma_requisicao_por_uf(self):
        relogio = RelogioFalso()
        t = TransporteRoteirizado(Resposta(200, SERGIPE), Resposta(200, "[]"))
        lista = list(municipios(t, ufs=[28, 21], pausa=1.0, dormir=relogio))

        self.assertEqual(len(lista), 75)
        self.assertEqual(len(t.urls), 2)
        self.assertEqual(t.urls[0], url_municipios_da_uf(28))
        self.assertEqual(relogio.esperas, [1.0])   # pausa entre as duas

    def test_sem_ufs_faz_uma_chamada_para_a_regiao(self):
        t = TransporteRoteirizado(Resposta(200, SERGIPE))
        list(municipios(t, dormir=RelogioFalso()))
        self.assertEqual(len(t.urls), 1)
        self.assertIn("/regioes/2/municipios", t.urls[0])

    def test_todos_os_75_de_sergipe_sao_do_nordeste(self):
        t = TransporteRoteirizado(Resposta(200, SERGIPE))
        lista = list(municipios(t, ufs=[28], dormir=RelogioFalso()))
        self.assertTrue(all(m.uf_sigla == "SE" for m in lista))
        self.assertTrue(all(m.regiao == "Nordeste" for m in lista))
        self.assertEqual(len({m.codigo for m in lista}), 75)   # sem duplicata


if __name__ == "__main__":
    unittest.main()
