"""Cliente das APIs públicas do IBGE.

Sem cadastro e sem token: `https://servicodados.ibge.gov.br`.

O desenho vem pronto do `sys-radar-licitacoes`, onde cada peça foi paga com um
erro real (ver `.claude/rules/radar-licitacoes.md`):

* **O transporte nunca levanta por falha de rede** -- devolve status. Um
  `TimeoutError` de socket é `OSError`, não `URLError`, e escapa de qualquer
  `except URLError`: foi assim que uma varredura perdeu 2.500 registros já
  lidos. Quem decide repetir precisa **receber**, não ser interrompido.
* **A espera é injetada.** Sem isso, testar backoff custa 35 s por execução.

E uma armadilha específica do IBGE, medida em 02/09/2026: **a malha geográfica
volta com `Content-Encoding: gzip`**, e um cliente que não descomprime estoura
com `UnicodeDecodeError: byte 0x8b in position 1` -- erro que não fala de gzip e
manda investigar o lado errado.
"""

from __future__ import annotations

import gzip
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable, Iterator

BASE = "https://servicodados.ibge.gov.br"

#: Região Nordeste no IBGE. Os nove estados, 1.794 municípios (medido).
REGIAO_NORDESTE = 2

#: Pseudo-status para falha de rede local (timeout de socket, conexão
#: derrubada). Existe para que esse caso entre no MESMO caminho de repetição
#: dos 5xx, em vez de escapar por fora.
FALHA_DE_REDE = 599

REPETIVEIS = frozenset({429, 500, 502, 503, 504, FALHA_DE_REDE})

PAUSA_PADRAO = 1.0
TENTATIVAS = 4
ESPERA_INICIAL = 2.0


class ErroIBGE(RuntimeError):
    """Falha que não adianta repetir sem mudar alguma coisa."""


@dataclass(frozen=True, slots=True)
class Resposta:
    status: int
    corpo: str


Transporte = Callable[[str], Resposta]


def transporte_http(timeout: float = 30.0) -> Transporte:
    """Transporte real. **Nunca levanta por falha de rede**: devolve status."""

    def buscar(url: str) -> Resposta:
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                # Pedir explicitamente é honesto: o servidor comprime de
                # qualquer forma, e assim a descompressão abaixo é regra, não
                # remendo para um caso que "às vezes acontece".
                "Accept-Encoding": "gzip",
                "User-Agent": "observatorio-ne/0.1 (dados abertos; uso pessoal)",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                bruto = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    bruto = gzip.decompress(bruto)
                return Resposta(r.status, bruto.decode("utf-8"))
        except urllib.error.HTTPError as e:
            corpo = e.read()
            if e.headers.get("Content-Encoding") == "gzip":
                try:
                    corpo = gzip.decompress(corpo)
                except OSError:
                    pass
            return Resposta(e.code, corpo.decode("utf-8", "replace"))
        except urllib.error.URLError as e:
            return Resposta(FALHA_DE_REDE, f"{type(e).__name__}: {e.reason}")
        except OSError as e:
            # `TimeoutError` de socket cai aqui, e **não** em `URLError`.
            return Resposta(FALHA_DE_REDE, f"{type(e).__name__}: {e}")

    return buscar


def buscar_json(
    transporte: Transporte,
    url: str,
    dormir: Callable[[float], None] = time.sleep,
) -> object:
    """Uma requisição, com repetição em falha transitória.

    **Ressalva conhecida:** o IBGE devolve **HTTP 500** para combinação de
    agregado/variável que não existe (medido: `4714/v5936` e `4709/v93`). Isso é
    permanente, mas indistinguível de 500 transitório pela resposta -- então
    gasta as quatro tentativas antes de desistir. O jeito de não pagar esse
    preço é **verificar a combinação antes** de colocá-la no código, que é o que
    o `ESPEC.md` exige.
    """
    espera = ESPERA_INICIAL
    for tentativa in range(1, TENTATIVAS + 1):
        r = transporte(url)
        if r.status == 200:
            try:
                return json.loads(r.corpo)
            except json.JSONDecodeError as e:
                raise ErroIBGE(f"200 com corpo que não é JSON em {url}") from e
        if r.status == 204 or (r.status == 200 and not r.corpo.strip()):
            return None
        if r.status in REPETIVEIS:
            if tentativa == TENTATIVAS:
                raise ErroIBGE(
                    f"{r.status} depois de {TENTATIVAS} tentativas em {url} "
                    f"({r.corpo[:120]}). Se for 500 constante, suspeitar de "
                    "agregado/variável inexistente antes de suspeitar da rede."
                )
            dormir(espera)
            espera *= 2
            continue
        raise ErroIBGE(f"HTTP {r.status} em {url}: {r.corpo[:200]}")
    raise AssertionError("inalcançável")


def url_municipios_da_uf(uf: int | str) -> str:
    return f"{BASE}/api/v1/localidades/estados/{uf}/municipios"


def url_municipios_da_regiao(regiao: int = REGIAO_NORDESTE) -> str:
    return f"{BASE}/api/v1/localidades/regioes/{regiao}/municipios"


def url_municipios_do_brasil() -> str:
    """Os 5.571 municípios do país numa requisição só (2,4 MB, verificado)."""
    return f"{BASE}/api/v1/localidades/municipios"


def url_ufs_do_brasil() -> str:
    return f"{BASE}/api/v1/localidades/estados"


def url_ufs_da_regiao(regiao: int = REGIAO_NORDESTE) -> str:
    return f"{BASE}/api/v1/localidades/regioes/{regiao}/estados"


@dataclass(frozen=True, slots=True)
class Municipio:
    """Um município, achatado a partir do JSON aninhado do IBGE."""

    codigo: int
    nome: str
    uf_sigla: str
    uf_nome: str
    regiao: str

    @classmethod
    def de_json(cls, bruto: dict) -> "Municipio":
        """Achata a hierarquia até a UF, por **dois caminhos**.

        O IBGE devolve `microrregiao.mesorregiao.UF` na maioria dos registros e
        `regiao-imediata.regiao-intermediaria.UF` em alguns — as duas divisões
        convivem na mesma resposta.

        **Município novo vem com `microrregiao: null`.** Medido em 03/09/2026 na
        lista nacional: **Boa Esperança do Norte/MT** (código 5101837), criado
        recentemente e ainda sem microrregião atribuída, é o único dos 5.571
        nessa situação. A versão anterior desta função levantava `ErroIBGE` nele
        — o que estava certo para o Nordeste, onde o caso não existe, e teria
        derrubado a ingestão nacional na primeira execução.

        Falhar quando NENHUM dos dois caminhos serve continua sendo o certo:
        gravar um município sem UF e descobrir no painel é pior.
        """
        uf = None
        micro = bruto.get("microrregiao")
        if isinstance(micro, dict):
            uf = micro.get("mesorregiao", {}).get("UF")
        if not isinstance(uf, dict):
            imediata = bruto.get("regiao-imediata")
            if isinstance(imediata, dict):
                uf = imediata.get("regiao-intermediaria", {}).get("UF")
        try:
            if not isinstance(uf, dict):
                raise TypeError("nem microrregiao nem regiao-imediata")
            return cls(
                codigo=int(bruto["id"]),
                nome=bruto["nome"],
                uf_sigla=uf["sigla"],
                uf_nome=uf["nome"],
                regiao=uf["regiao"]["nome"],
            )
        except (KeyError, TypeError, ValueError) as e:
            trecho = json.dumps(bruto, ensure_ascii=False)[:160]
            raise ErroIBGE(
                f"estrutura inesperada de município: {trecho}"
            ) from e


# Marcadores do IBGE para valor que não é número. Não são erro: são o jeito de
# a fonte dizer "não se aplica", "não disponível" ou "omitido por sigilo".
# Guardar `None` preserva a distinção entre "zero" e "não sabemos" -- confundir
# os dois é como um painel passa a mentir sem ninguém notar.
AUSENTES = frozenset({"-", "..", "...", "X", "x", ".", ""})


@dataclass(frozen=True, slots=True)
class Observacao:
    """Um valor de um indicador, para um município, num período."""

    municipio: int
    periodo: str
    valor: float | None
    origem: str

    @property
    def ausente(self) -> bool:
        return self.valor is None


def _numero(bruto: str) -> float | None:
    """`None` quando a fonte diz que não há número."""
    texto = (bruto or "").strip()
    if texto in AUSENTES:
        return None
    try:
        return float(texto.replace(",", "."))
    except ValueError:
        # Marcador novo do IBGE: tratar como ausente é mais seguro que
        # estourar a ingestão inteira por causa de uma célula.
        return None


def url_serie(agregado: int, periodo: str, variavel: int, uf: int | str) -> str:
    return (f"{BASE}/api/v3/agregados/{agregado}/periodos/{periodo}"
            f"/variaveis/{variavel}?localidades=N6[N3[{uf}]]")


#: O nível do IBGE que representa o Brasil inteiro. N1 é o país, N2 a região,
#: N3 a UF e N6 o município — e a conferência precisa saber em qual pedir.
NIVEL_BRASIL = "N1[all]"


def url_serie_regiao(agregado: int, periodo: str, variavel: int,
                     regiao: int | None = REGIAO_NORDESTE) -> str:
    """O mesmo indicador no nível da REGIÃO (N2) ou do BRASIL (N1).

    Existe para conferência: a soma dos municípios tem de bater com o total que
    a fonte publica. É a diferença entre "o número que eu peguei" e "o número
    certo" -- e pega, de uma vez, município faltando, duplicado ou mal somado.

    `regiao=None` pede o total do país. Sem isso, a ingestão nacional somaria
    5.571 municípios e compararia com o total do **Nordeste** — batendo de
    frente com a única verificação que o sistema tem.
    """
    nivel = NIVEL_BRASIL if regiao is None else f"N2[{regiao}]"
    return (f"{BASE}/api/v3/agregados/{agregado}/periodos/{periodo}"
            f"/variaveis/{variavel}?localidades={nivel}")


def total_da_regiao(dados: object) -> float | None:
    """O valor único de uma resposta de nível regional."""
    try:
        serie_ = dados[0]["resultados"][0]["series"][0]["serie"]  # type: ignore[index]
        return _numero(next(iter(serie_.values())))
    except (KeyError, IndexError, TypeError, StopIteration) as e:
        raise ErroIBGE("resposta regional sem série utilizável") from e


def serie(
    transporte: Transporte,
    agregado: int,
    periodo: str,
    variavel: int,
    ufs: list[int | str],
    pausa: float = PAUSA_PADRAO,
    dormir: Callable[[float], None] = time.sleep,
) -> Iterator[Observacao]:
    """As observações de um indicador, uma requisição por UF.

    O JSON vem aninhado como `[{resultados: [{series: [{localidade, serie}]}]}]`,
    e **o valor vem como texto** -- inclusive os marcadores de ausência.
    """
    for i, uf in enumerate(ufs):
        if i:
            dormir(pausa)
        url = url_serie(agregado, periodo, variavel, uf)
        dados = buscar_json(transporte, url, dormir)
        if not dados:
            continue
        if not isinstance(dados, list) or not dados:
            raise ErroIBGE(f"esperava lista não vazia em {url}")
        try:
            resultados = dados[0]["resultados"]
        except (KeyError, TypeError) as e:
            raise ErroIBGE(f"resposta sem `resultados` em {url}") from e
        for resultado in resultados:
            for item in resultado.get("series", []):
                try:
                    codigo = int(item["localidade"]["id"])
                    valores = item["serie"]
                except (KeyError, TypeError, ValueError) as e:
                    trecho = json.dumps(item, ensure_ascii=False)[:160]
                    raise ErroIBGE(f"série inesperada: {trecho}") from e
                for per, bruto in valores.items():
                    yield Observacao(codigo, per, _numero(bruto), url)


def metadados_da_serie(dados: object) -> tuple[str, str]:
    """`(nome da variável, unidade)` — o rótulo vem na própria resposta, então
    não precisa ser digitado à mão e não pode divergir da fonte."""
    if not isinstance(dados, list) or not dados:
        raise ErroIBGE("resposta vazia ao ler metadados")
    return dados[0].get("variavel", "?"), dados[0].get("unidade", "?")


def municipios(
    transporte: Transporte,
    ufs: list[int | str] | None = None,
    regiao: int | None = REGIAO_NORDESTE,
    pausa: float = PAUSA_PADRAO,
    dormir: Callable[[float], None] = time.sleep,
) -> Iterator[Municipio]:
    """Os municípios, uma requisição por UF.

    Uma requisição por UF, e não uma por município: são **nove** contra 1.794 no
    Nordeste, e **27** contra 5.571 no país.

    Sem `ufs`, faz uma única chamada — para a região, ou para o Brasil inteiro
    quando `regiao is None`.
    """
    urls = ([url_municipios_da_uf(uf) for uf in ufs]
            if ufs
            else [url_municipios_do_brasil() if regiao is None
                  else url_municipios_da_regiao(regiao)])
    for i, url in enumerate(urls):
        if i:
            dormir(pausa)
        dados = buscar_json(transporte, url, dormir)
        if not dados:
            continue
        if not isinstance(dados, list):
            raise ErroIBGE(f"esperava lista de municípios em {url}")
        for bruto in dados:
            yield Municipio.de_json(bruto)
