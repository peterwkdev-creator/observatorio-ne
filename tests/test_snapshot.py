"""O contrato entre as duas linguagens.

O painel em TypeScript lê este JSON no build. Se o Python mudar a forma do
snapshot, **o painel quebra em outro repositório, em outra linguagem, e o
Python não fica sabendo**. Este teste é o que impede isso: ele afirma a forma
que `painel/lib/dados.ts` declara em `type Snapshot`.

Ao mudar o formato aqui, mudar o tipo lá — e vice-versa.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from observatorio.armazem import Armazem
from observatorio.ibge import Municipio, Observacao, Resposta, serie

FIXTURES = Path(__file__).parent / "fixtures"
SERGIPE = (FIXTURES / "municipios_se.json").read_text(encoding="utf-8")
PIB_SE = (FIXTURES / "pib2021_se.json").read_text(encoding="utf-8")


class TestFormaDoSnapshot(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Armazem(Path(self.tmp.name) / "obs.db")
        self.db.gravar_municipios(
            [Municipio.de_json(b) for b in json.loads(SERGIPE)])
        self.db.registrar_indicador("pib-municipal", "PIB a preços correntes",
                                    "Mil Reais", 5938, 37)
        obs = list(serie(lambda u: Resposta(200, PIB_SE), 5938, "2021", 37,
                         ufs=[28], dormir=lambda _: None))
        self.db.gravar_observacoes("pib-municipal", obs)
        self.snap = self.db.snapshot()

    def tearDown(self) -> None:
        self.db.fechar()
        self.tmp.cleanup()

    def test_chaves_de_topo(self):
        # Exatamente as que `type Snapshot` declara no painel.
        self.assertEqual(
            set(self.snap),
            {"geradoEm", "fonte", "colunas", "indicadores", "ufs", "municipios"})

    def test_indicador_carrega_a_procedencia(self):
        ind = self.snap["indicadores"][0]
        self.assertEqual(
            set(ind),
            {"codigo", "nome", "unidade", "agregado", "variavel", "periodo",
             "origem", "coletadoEm", "totalRegiao"})
        # O painel não pode exibir número sem poder dizer de onde veio.
        self.assertIn("servicodados.ibge.gov.br", ind["origem"])
        self.assertEqual(ind["periodo"], "2021")

    def test_municipio_e_lista_compacta_na_ordem_das_colunas(self):
        colunas = self.snap["colunas"]
        self.assertEqual(colunas[:3], ["codigo", "nome", "uf"])
        linha = self.snap["municipios"][0]
        self.assertEqual(len(linha), len(colunas))
        self.assertIsInstance(linha[0], int)     # código IBGE
        self.assertIsInstance(linha[1], str)     # nome
        self.assertIsInstance(linha[2], str)     # UF

    def test_uf_traz_totais_por_indicador(self):
        uf = self.snap["ufs"][0]
        self.assertEqual(set(uf), {"sigla", "nome", "municipios", "totais"})
        self.assertEqual(uf["sigla"], "SE")
        self.assertEqual(uf["municipios"], 75)
        self.assertIn("pib-municipal", uf["totais"])

    def test_total_da_uf_bate_com_a_soma_das_linhas(self):
        # Se o agregado por UF divergir das linhas, o painel mostra dois
        # números diferentes para a mesma coisa — e quem lê perde a confiança.
        i = self.snap["colunas"].index("pib-municipal")
        soma = sum(l[i] for l in self.snap["municipios"] if l[i] is not None)
        self.assertAlmostEqual(self.snap["ufs"][0]["totais"]["pib-municipal"],
                               soma, places=2)

    def test_valor_ausente_vira_null_e_nao_zero(self):
        self.db.gravar_observacoes(
            "pib-municipal",
            [Observacao(2800100, "2099", None, "https://exemplo")])
        snap = self.db.snapshot()
        i = snap["colunas"].index("pib-municipal")
        # A linha existe; o valor pode ser None — nunca 0 vindo de ausência.
        valores = [l[i] for l in snap["municipios"]]
        self.assertNotIn(0, [v for v in valores if v is not None])

    def test_serializa_em_json_sem_perder_nada(self):
        texto = json.dumps(self.snap, ensure_ascii=False)
        self.assertEqual(json.loads(texto)["colunas"], self.snap["colunas"])


if __name__ == "__main__":
    unittest.main()
