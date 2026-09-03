"""Linha de comando do Observatório NE.

    python -m observatorio ingerir-municipios
    python -m observatorio municipios --uf SE
    python -m observatorio coletas
"""

from __future__ import annotations

import argparse
import os
import sys

from .armazem import Armazem
from .ibge import (
    PAUSA_PADRAO,
    buscar_json,
    metadados_da_serie,
    total_da_regiao,
    url_serie_regiao,
    municipios as buscar_municipios,
    serie as buscar_serie,
    transporte_http,
    url_serie,
)

#: Os nove estados do Nordeste, por código IBGE. Explícito e não derivado:
#: a lista é estável desde 1988 e vale mais legível que calculada.
UFS_NORDESTE = {
    21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB",
    26: "PE", 27: "AL", 28: "SE", 29: "BA",
}


def br(valor: float | None, casas: int = 0) -> str:
    """Número no formato brasileiro: milhar com ponto, decimal com vírgula.

    O `.replace(",", ".")` ingênuo produzia `30.663.6` — dois separadores de
    milhar e nenhum decimal. Trocar os dois exige um marcador temporário.
    """
    if valor is None:
        return "—"
    texto = f"{valor:,.{casas}f}"
    # str.translate troca os dois separadores numa passada so, sem
    # marcador temporario -- que foi como a primeira tentativa produziu
    # 30.663.6: dois separadores de milhar e nenhum decimal.
    return texto.translate(str.maketrans(",.", ".,"))


#: Acima disto, a diferença deixa de ser arredondamento e vira problema.
#: 1e-6 = um milionésimo: no PIB do Nordeste (R$ 1,24 trilhão em mil reais)
#: tolera ~1.243 de diferença, e um único município faltando pesaria milhares
#: de vezes mais que isso.
TOLERANCIA_RELATIVA = 1e-6


def conferir(args) -> int:
    """Soma dos municípios × total regional publicado pelo IBGE.

    É a prova de integridade da ingestão: pega município faltando, duplicado ou
    mal somado numa comparação só, contra a própria fonte.

    **Igualdade exata é o teste errado**, e a primeira execução real mostrou por
    quê: o PIB fechou com diferença de 5 em 1.243.103.280. O IBGE publica o PIB
    municipal em *Mil Reais* já arredondado, e calcula o agregado regional antes
    de arredondar — soma de partes arredondadas não bate com o total arredondado.
    Esconder isso alargando a tolerância seria mentir; o certo é **classificar**:
    arredondamento é uma coisa, município faltando é outra, e a diferença
    relativa separa as duas com folga de várias ordens de grandeza.
    """
    transporte = transporte_http()
    with Armazem(args.banco) as db:
        indicadores = db.indicadores()
        if not indicadores:
            print("Nenhum indicador ingerido ainda.")
            return 0
        divergiu = False
        for ind in indicadores:
            periodo = INDICADORES[ind["codigo"]][1]
            url = url_serie_regiao(ind["agregado"], periodo, ind["variavel"])
            oficial = total_da_regiao(buscar_json(transporte, url))
            nossa = db.con.execute(
                "SELECT SUM(valor) FROM observacao WHERE indicador = ?"
                " AND periodo = ?", (ind["codigo"], periodo)).fetchone()[0]

            if nossa is None:
                print(f"  {ind['codigo']:<24} sem observações gravadas")
                continue
            if oficial is None:
                print(f"  {ind['codigo']:<24} IBGE não publicou o total regional")
                continue
            diferenca = oficial - nossa
            relativa = abs(diferenca) / oficial if oficial else 0.0
            if abs(diferenca) < 0.5:
                veredito = "confere"
            elif relativa < TOLERANCIA_RELATIVA:
                veredito = (f"confere (arredondamento: {br(diferenca)} em "
                            f"{br(oficial)}, {relativa:.1e})")
            else:
                veredito = f"DIVERGE em {br(diferenca)} ({relativa:.2%})"
                divergiu = True
            print(f"  {ind['codigo']:<24} municípios {br(nossa)} · "
                  f"IBGE (região) {br(oficial)} · {veredito}")
    return 1 if divergiu else 0


def ingerir_municipios(args, transporte=None, dormir=None) -> int:
    """`transporte` e `dormir` são injetados pelo teste ponta a ponta."""
    extra = {} if dormir is None else {"dormir": dormir}
    ufs = [args.uf] if args.uf else list(UFS_NORDESTE)
    print(f"Ingerindo municípios de {len(ufs)} UF(s), pausa {args.pausa}s.")

    lidos = novos = inalterados = 0
    erro = None
    with Armazem(args.banco) as db:
        try:
            achados = list(buscar_municipios(
                transporte or transporte_http(), ufs=ufs,
                pausa=args.pausa, **extra))
            lidos = len(achados)
            novos, inalterados = db.gravar_municipios(achados)
        except (Exception, KeyboardInterrupt) as e:
            # Qualquer interrupção, não só a prevista: o que já veio vale, e a
            # lição de capturar só o erro esperado já foi paga no radar.
            erro = f"{type(e).__name__}: {e}"
            print(f"\n[!] interrompido: {erro}", file=sys.stderr)
        db.anotar_coleta("municipios", lidos, novos, inalterados, erro)
        contagem = db.contagem_por_uf()

    print(f"\n{lidos} lidos · {novos} novos · {inalterados} já conhecidos")
    if contagem:
        print("  " + " · ".join(f"{uf} {n}" for uf, n in contagem.items()))
        print(f"  total no banco: {sum(contagem.values())}")
    return 1 if erro else 0


#: Só entra aqui combinação de agregado/variável/período **verificada contra a
#: API**. Duas outras (densidade demográfica e o agregado 4709) devolveram
#: HTTP 500 e ficaram de fora — escrevê-las pelo catálogo seria promessa falsa.
INDICADORES = {
    "populacao-censo-2022": (4714, "2022", 93),
    "populacao-estimada":   (6579, "2024", 9324),
    "pib-municipal":        (5938, "2021", 37),
}


def ingerir_indicador(args, transporte=None, dormir=None) -> int:
    extra = {} if dormir is None else {"dormir": dormir}
    agregado, periodo, variavel = INDICADORES[args.indicador]
    ufs = [args.uf] if args.uf else list(UFS_NORDESTE)
    transporte = transporte or transporte_http()
    print(f"Ingerindo '{args.indicador}' (agregado {agregado}, período "
          f"{periodo}, variável {variavel}) em {len(ufs)} UF(s).")

    lidas = novas = inalteradas = 0
    erro = None
    with Armazem(args.banco) as db:
        try:
            # O rótulo e a unidade vêm da própria resposta: assim não divergem
            # da fonte nem dependem de alguém digitar certo.
            amostra = buscar_json(transporte, url_serie(agregado, periodo,
                                                        variavel, ufs[0]),
                                  **({} if dormir is None else {"dormir": dormir}))
            nome, unidade = metadados_da_serie(amostra)
            db.registrar_indicador(args.indicador, nome, unidade, agregado,
                                   variavel)

            observacoes = list(buscar_serie(transporte, agregado, periodo,
                                            variavel, ufs, pausa=args.pausa,
                                            **extra))
            lidas = len(observacoes)
            novas, inalteradas = db.gravar_observacoes(args.indicador,
                                                       observacoes)
        except (Exception, KeyboardInterrupt) as e:
            erro = f"{type(e).__name__}: {e}"
            print(f"\n[!] interrompido: {erro}", file=sys.stderr)
        db.anotar_coleta(args.indicador, lidas, novas, inalteradas, erro)
        resumo = db.resumo_indicador(args.indicador)

    print(f"\n{lidas} lidas · {novas} novas · {inalteradas} já conhecidas")
    if resumo:
        print(f"\n{'UF':<4}{'munic.':>8}{'c/ valor':>10}{'média':>16}")
        for l in resumo:
            print(f"{l['uf_sigla']:<4}{l['municipios']:>8}{l['com_valor']:>10}"
                  f"{br(l['media'], 1):>16}")
    return 1 if erro else 0


def listar_observacoes(args) -> int:
    with Armazem(args.banco) as db:
        linhas = db.observacoes(args.indicador, args.uf_filtro, args.limite)
        indicadores = {l["codigo"]: l for l in db.indicadores()}
    if not linhas:
        print("Nada gravado para esse indicador — rodar `ingerir-indicador`.")
        return 0
    ind = indicadores.get(args.indicador)
    if ind:
        print(f"{ind['nome']} ({ind['unidade']}) — agregado {ind['agregado']}, "
              f"variável {ind['variavel']}")
    for l in linhas:
        valor = "sem valor" if l["valor"] is None else br(l["valor"])
        print(f"  {l['nome']:<32}{l['uf_sigla']}  {l['periodo']}  {valor:>14}")
    print(f"\n  fonte: {linhas[0]['origem']}")
    print(f"  coletado em: {linhas[0]['coletado_em']}")
    return 0


def exportar(args) -> int:
    """Escreve o snapshot JSON que o painel lê no build.

    A costura entre as duas linguagens é este arquivo — e ela existe para que a
    coleta e a procedência fiquem do lado testável sem rede, e o front não tenha
    responsabilidade nenhuma de buscar dado.
    """
    import json
    from pathlib import Path as _P

    with Armazem(args.banco) as db:
        dados = db.snapshot()

    destino = _P(args.saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    # `separators` sem espaço: o arquivo é baixado por quem visita o painel.
    texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    destino.write_text(texto, encoding="utf-8")

    tamanho = len(texto.encode("utf-8")) / 1024
    print(f"{destino} · {len(dados['municipios'])} municípios · "
          f"{len(dados['indicadores'])} indicadores · {br(tamanho, 1)} KB")
    for i in dados["indicadores"]:
        print(f"  {i['codigo']:<24} {i['periodo']}  {i['unidade']:<12} "
              f"total {br(i['totalRegiao'])}")
    return 0


def listar_municipios(args) -> int:
    with Armazem(args.banco) as db:
        linhas = db.municipios(args.uf_filtro)
    if not linhas:
        print("Nada gravado ainda — rodar `ingerir-municipios` primeiro.")
        return 0
    for l in linhas[: args.limite]:
        print(f"  {l['codigo']}  {l['uf_sigla']}  {l['nome']}")
    if len(linhas) > args.limite:
        print(f"  ... e mais {len(linhas) - args.limite}")
    return 0


def listar_coletas(args) -> int:
    with Armazem(args.banco) as db:
        linhas = db.coletas()
    if not linhas:
        print("Nenhuma coleta registrada.")
        return 0
    print(f"{'quando':<26}{'alvo':<16}{'lidos':>7}{'novos':>7}{'igual':>7}  erro")
    for l in linhas:
        print(f"{l['rodou_em']:<26}{l['alvo']:<16}{l['lidos']:>7}"
              f"{l['novos']:>7}{l['inalterados']:>7}  {l['erro'] or ''}")
    return 0


def construir_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="observatorio",
        description="Dados abertos dos municípios do Nordeste (IBGE).")
    p.add_argument("--banco",
                   default=os.environ.get("OBS_BANCO", "observatorio.db"),
                   help="arquivo SQLite (padrão: observatorio.db)")
    sub = p.add_subparsers(dest="comando", required=True)

    i = sub.add_parser("ingerir-municipios",
                       help="busca os municípios no IBGE e grava")
    i.add_argument("--uf", type=int, choices=sorted(UFS_NORDESTE),
                   help="só esta UF (código IBGE); padrão é as nove")
    i.add_argument("--pausa", type=float,
                   default=float(os.environ.get("OBS_PAUSA", PAUSA_PADRAO)),
                   help=f"segundos entre requisições (padrão: {PAUSA_PADRAO})")
    i.set_defaults(func=ingerir_municipios)

    m = sub.add_parser("municipios", help="lista o que está gravado")
    m.add_argument("--uf", dest="uf_filtro", help="sigla, ex.: SE")
    m.add_argument("--limite", type=int, default=30)
    m.set_defaults(func=listar_municipios)

    ii = sub.add_parser("ingerir-indicador",
                        help="busca um indicador no IBGE e grava")
    ii.add_argument("indicador", choices=sorted(INDICADORES))
    ii.add_argument("--uf", type=int, choices=sorted(UFS_NORDESTE))
    ii.add_argument("--pausa", type=float,
                    default=float(os.environ.get("OBS_PAUSA", PAUSA_PADRAO)))
    ii.set_defaults(func=ingerir_indicador)

    o = sub.add_parser("observacoes", help="mostra os valores gravados")
    o.add_argument("indicador", choices=sorted(INDICADORES))
    o.add_argument("--uf", dest="uf_filtro", help="sigla, ex.: RN")
    o.add_argument("--limite", type=int, default=20)
    o.set_defaults(func=listar_observacoes)

    cf = sub.add_parser(
        "conferir",
        help="soma dos municípios × total regional do IBGE (integridade)")
    cf.set_defaults(func=conferir)

    e = sub.add_parser("exportar", help="gera o JSON que o painel consome")
    e.add_argument("--saida", default="painel/dados/snapshot.json")
    e.set_defaults(func=exportar)

    c = sub.add_parser("coletas", help="histórico de execuções")
    c.set_defaults(func=listar_coletas)
    return p


def main(argv: list[str] | None = None) -> int:
    args = construir_parser().parse_args(argv)
    return args.func(args)
