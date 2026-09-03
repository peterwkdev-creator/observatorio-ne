"""Indicadores, contra respostas reais do IBGE.

O critério de aceite desta etapa é objetivo e verificável por qualquer um:
**Acari/RN tem 10.597 habitantes no Censo 2022**, e é isso que tem de estar no
banco. Um observatório que erra o número não tem o que discutir sobre desenho.
"""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

from observatorio.armazem import Armazem
from observatorio.cli import construir_parser, ingerir_indicador
from observatorio.ibge import (
    ErroIBGE,
    Municipio,
    Observacao,
    Resposta,
    _numero,
    metadados_da_serie,
    serie,
)

FIXTURES = Path(__file__).parent / "fixtures"
CENSO_RN = (FIXTURES / "censo2022_pop_rn.json").read_text(encoding="utf-8")
PIB_SE = (FIXTURES / "pib2021_se.json").read_text(encoding="utf-8")
SERGIPE = (FIXTURES / "municipios_se.json").read_text(encoding="utf-8")

ACARI = 2400109   # código IBGE de Acari/RN


def transporte(*respostas):
    pendentes = list(respostas)
    return lambda url: pendentes.pop(0)


class TestValorAusente(unittest.TestCase):
    """O IBGE usa marcadores de texto para "não há número". Guardar `None`
    preserva a distinção entre **zero** e **não sabemos** — confundir os dois é
    como um painel passa a mentir sem ninguém notar."""

    def test_marcadores_viram_none(self):
        for marcador in ("-", "...", "..", "X", "x", "", "   "):
            with self.subTest(marcador=marcador):
                self.assertIsNone(_numero(marcador))

    def test_numero_de_verdade_sobrevive(self):
        self.assertEqual(_numero("10597"), 10597.0)
        self.assertEqual(_numero("37967"), 37967.0)

    def test_decimal_com_virgula(self):
        self.assertEqual(_numero("1.234,5".replace(".", "")), 1234.5)

    def test_marcador_desconhecido_nao_derruba_a_ingestao(self):
        # Um marcador novo do IBGE não pode custar a coleta inteira.
        self.assertIsNone(_numero("¤"))


class TestSerie(unittest.TestCase):
    def test_le_a_estrutura_aninhada_e_acha_acari(self):
        obs = list(serie(transporte(Resposta(200, CENSO_RN)),
                         4714, "2022", 93, ufs=[24], dormir=lambda _: None))
        self.assertEqual(len(obs), 167)

        acari = next(o for o in obs if o.municipio == ACARI)
        self.assertEqual(acari.valor, 10597.0)     # o critério de aceite
        self.assertEqual(acari.periodo, "2022")
        self.assertIn("agregados/4714", acari.origem)

    def test_a_origem_fica_em_cada_observacao(self):
        # Procedência é campo, não comentário: sem ela o número não serve.
        obs = list(serie(transporte(Resposta(200, PIB_SE)),
                         5938, "2021", 37, ufs=[28], dormir=lambda _: None))
        self.assertEqual(len(obs), 75)
        self.assertTrue(all("variaveis/37" in o.origem for o in obs))

    def test_uma_requisicao_por_uf_com_pausa_entre_elas(self):
        esperas = []
        obs = list(serie(transporte(Resposta(200, CENSO_RN), Resposta(200, PIB_SE)),
                         4714, "2022", 93, ufs=[24, 28], pausa=2.0,
                         dormir=esperas.append))
        self.assertEqual(len(obs), 167 + 75)
        self.assertEqual(esperas, [2.0])

    def test_resposta_sem_resultados_falha_dizendo_o_que_faltou(self):
        with self.assertRaises(ErroIBGE) as ctx:
            list(serie(transporte(Resposta(200, '[{"id":"93"}]')),
                       4714, "2022", 93, ufs=[24], dormir=lambda _: None))
        self.assertIn("resultados", str(ctx.exception))

    def test_metadados_vem_da_propria_resposta(self):
        nome, unidade = metadados_da_serie(json.loads(CENSO_RN))
        self.assertEqual(nome, "População residente")
        self.assertEqual(unidade, "Pessoas")

        nome, unidade = metadados_da_serie(json.loads(PIB_SE))
        self.assertEqual(unidade, "Mil Reais")


class TestArmazemObservacoes(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = str(Path(self.tmp.name) / "obs.db")
        self.db = Armazem(self.banco)
        self.db.gravar_municipios(
            [Municipio.de_json(b) for b in json.loads(SERGIPE)])
        self.db.registrar_indicador("pib-municipal", "PIB", "Mil Reais",
                                    5938, 37)
        self.obs = list(serie(transporte(Resposta(200, PIB_SE)),
                              5938, "2021", 37, ufs=[28], dormir=lambda _: None))

    def tearDown(self) -> None:
        self.db.fechar()
        self.tmp.cleanup()

    def test_primeira_gravacao_conta_todas_como_novas(self):
        self.assertEqual(self.db.gravar_observacoes("pib-municipal", self.obs),
                         (75, 0))

    def test_regravar_o_mesmo_valor_nao_cria_nada(self):
        self.db.gravar_observacoes("pib-municipal", self.obs)
        self.assertEqual(self.db.gravar_observacoes("pib-municipal", self.obs),
                         (0, 75))

    def test_revisao_do_ibge_entra_ao_lado_e_nao_apaga(self):
        # O IBGE revisa PIB retroativamente. O valor anterior é história, não
        # lixo — e o painel mostra o mais recente sem perder o rastro.
        self.db.gravar_observacoes("pib-municipal", self.obs)
        alvo = self.obs[0]
        revisado = Observacao(alvo.municipio, alvo.periodo,
                              (alvo.valor or 0) + 1000, alvo.origem)
        novas, _ = self.db.gravar_observacoes("pib-municipal", [revisado])

        self.assertEqual(novas, 1)
        linhas = list(self.db.con.execute(
            "SELECT valor FROM observacao WHERE municipio = ? AND indicador = ?",
            (alvo.municipio, "pib-municipal")))
        self.assertEqual(len(linhas), 2)          # as duas convivem

    def test_observacao_de_municipio_desconhecido_e_recusada(self):
        # Melhor falhar que gravar um número sem lugar no mapa.
        orfa = Observacao(9999999, "2021", 1.0, "https://exemplo")
        with self.assertRaises(ValueError) as ctx:
            self.db.gravar_observacoes("pib-municipal", [orfa])
        self.assertIn("desconhecido", str(ctx.exception))

    def test_media_por_uf_ignora_valor_ausente(self):
        # Média sobre valor ausente seria média inventada.
        self.db.gravar_observacoes("pib-municipal", self.obs)
        self.db.gravar_observacoes(
            "pib-municipal",
            [Observacao(2800100, "2099", None, "https://exemplo")])
        linha = self.db.resumo_indicador("pib-municipal")[0]
        self.assertEqual(linha["municipios"], 76)   # linhas gravadas
        self.assertEqual(linha["com_valor"], 75)    # só as que têm número


class TestIngestaoDeIndicadorPontaAPonta(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = str(Path(self.tmp.name) / "obs.db")
        with Armazem(self.banco) as db:
            db.gravar_municipios(
                [Municipio.de_json(b) for b in json.loads(SERGIPE)])

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _rodar(self, *respostas):
        pendentes = list(respostas)
        args = construir_parser().parse_args(
            ["--banco", self.banco, "ingerir-indicador", "pib-municipal",
             "--uf", "28", "--pausa", "0"])
        saida, erros = io.StringIO(), io.StringIO()
        with redirect_stdout(saida), redirect_stderr(erros):
            codigo = ingerir_indicador(args, transporte=lambda u: pendentes.pop(0),
                                       dormir=lambda _: None)
        return codigo, saida.getvalue() + erros.getvalue()

    def test_ingestao_completa_e_o_indicador_fica_rotulado_pela_fonte(self):
        # Duas respostas: a primeira lê metadados, a segunda traz a série.
        codigo, saida = self._rodar(Resposta(200, PIB_SE), Resposta(200, PIB_SE))
        self.assertEqual(codigo, 0)
        self.assertIn("75 lidas", saida)
        self.assertIn("75 novas", saida)

        with Armazem(self.banco) as db:
            ind = db.indicadores()[0]
            self.assertEqual(ind["unidade"], "Mil Reais")   # veio da resposta
            self.assertEqual(len(db.observacoes("pib-municipal", limite=200)), 75)

    def test_rodar_de_novo_e_idempotente(self):
        self._rodar(Resposta(200, PIB_SE), Resposta(200, PIB_SE))
        codigo, saida = self._rodar(Resposta(200, PIB_SE), Resposta(200, PIB_SE))
        self.assertEqual(codigo, 0)
        self.assertIn("0 novas", saida)
        self.assertIn("75 já conhecidas", saida)

    def test_falha_da_api_registra_a_coleta_e_nao_grava_pela_metade(self):
        codigo, saida = self._rodar(*[Resposta(500, "boom")] * 4)
        self.assertEqual(codigo, 1)
        with Armazem(self.banco) as db:
            self.assertEqual(db.observacoes("pib-municipal"), [])
            self.assertIn("500", db.coletas()[0]["erro"])


if __name__ == "__main__":
    unittest.main()


class TestConferenciaContraAFonte(unittest.TestCase):
    """A prova de integridade: a soma dos municípios tem de bater com o total
    que o próprio IBGE publica no nível da região.

    Verificar um município (Acari = 10.597) prova que o parse está certo.
    **Só a soma prova que a ingestão está completa** — pega município faltando,
    duplicado ou mal somado numa comparação só, contra a própria fonte.
    """

    def test_le_o_total_da_resposta_regional(self):
        from observatorio.ibge import total_da_regiao, url_serie_regiao
        regional = json.dumps([{
            "id": "93", "variavel": "População residente", "unidade": "Pessoas",
            "resultados": [{"series": [{
                "localidade": {"id": "2", "nome": "Nordeste"},
                "serie": {"2022": "54658515"}}]}],
        }])
        self.assertEqual(total_da_regiao(json.loads(regional)), 54658515.0)
        self.assertIn("N2[2]", url_serie_regiao(4714, "2022", 93))

    def test_regional_sem_serie_falha_com_mensagem(self):
        from observatorio.ibge import total_da_regiao
        with self.assertRaises(ErroIBGE):
            total_da_regiao([{"resultados": []}])

    def test_marcador_de_ausente_no_total_regional_vira_none(self):
        from observatorio.ibge import total_da_regiao
        regional = [{"resultados": [{"series": [{"serie": {"2022": "..."}}]}]}]
        self.assertIsNone(total_da_regiao(regional))


class TestFormatoBrasileiro(unittest.TestCase):
    """O primeiro `.replace(",", ".")` produzia `30.663.6` — dois separadores de
    milhar e nenhum decimal. Saiu na primeira execução real."""

    def test_milhar_com_ponto_e_decimal_com_virgula(self):
        from observatorio.cli import br
        self.assertEqual(br(30663.6, 1), "30.663,6")
        self.assertEqual(br(54658515), "54.658.515")
        self.assertEqual(br(10597), "10.597")

    def test_numero_pequeno_sem_separador(self):
        from observatorio.cli import br
        self.assertEqual(br(75), "75")
        self.assertEqual(br(9.5, 1), "9,5")

    def test_ausente_nao_vira_zero(self):
        from observatorio.cli import br
        self.assertEqual(br(None), "—")


class TestToleranciaDaConferencia(unittest.TestCase):
    """Igualdade exata é o teste errado para agregado arredondado.

    A primeira execução real mostrou: o PIB fechou com **diferença de 5 em
    1.243.103.280**. O IBGE publica o PIB municipal em Mil Reais já arredondado
    e calcula o total regional antes de arredondar. Isso é aritmética, não erro
    de ingestão — e a diferença relativa separa os dois casos com folga de
    várias ordens de grandeza.
    """

    def test_a_tolerancia_aceita_o_caso_real_do_pib(self):
        from observatorio.cli import TOLERANCIA_RELATIVA
        diferenca, total = 5, 1_243_103_280
        self.assertLess(diferenca / total, TOLERANCIA_RELATIVA)

    def test_e_recusa_um_municipio_faltando(self):
        # Um município médio do Nordeste tem PIB na casa das centenas de
        # milhares (em mil reais). Some um e a diferença relativa explode.
        from observatorio.cli import TOLERANCIA_RELATIVA
        total = 1_243_103_280
        for pib_de_um_municipio in (100_000, 10_000, 2_000):
            with self.subTest(municipio=pib_de_um_municipio):
                self.assertGreater(pib_de_um_municipio / total,
                                   TOLERANCIA_RELATIVA)

    def test_a_folga_entre_os_dois_casos_e_de_ordens_de_grandeza(self):
        # Não é um limiar apertado que "quase pega" os dois: o menor município
        # plausível ainda é centenas de vezes maior que o arredondamento.
        arredondamento = 5 / 1_243_103_280
        municipio_pequeno = 2_000 / 1_243_103_280
        self.assertGreater(municipio_pequeno / arredondamento, 100)
