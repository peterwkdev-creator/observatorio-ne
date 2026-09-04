import { br } from "../../lib/dados";
import type { PanoramaUf } from "../../lib/nacional";

/**
 * Os 27 estados numa tira, com um deles marcado.
 *
 * ## Um quarto tipo de gráfico, porque a pergunta é outra
 *
 * O site já tem três. O *sparkline* mostra **um município ao longo do tempo**;
 * a tabela de funções, **as partes de um todo**; o histograma, **um caso dentro
 * de uma população grande e anônima**. Este mostra **poucos casos, nomeados e
 * ordenados** — e é a forma certa para 27, onde um histograma seria caricatura
 * (barras de um ou dois estados cada) e uma tabela de 27 linhas obrigaria a
 * varrer tudo para achar o seu.
 *
 * ## Marca por forma, não só por cor
 *
 * O estado desta página ganha **losango, rótulo e traço vertical**; os outros,
 * pontos pequenos. Distinguir só por cor reprovaria no critério 1.4.1 do WCAG
 * e sumiria em daltonismo — o mesmo erro que as faixas fiscais já custaram.
 *
 * ## Não é ranque
 *
 * Não há número de posição, nem pódio, nem cor de alerta. A tira ordena para
 * poder situar; dizer "22º lugar" afirmaria um juízo que o dado não sustenta.
 */

const L = 320;
const A = 42;
const M = { esq: 8, dir: 8, topo: 14, base: 14 };

export default function TiraEstados({
  panorama,
  destaque,
  valorDe,
  formatar,
  rotuloEixo,
  descricao,
}: {
  panorama: PanoramaUf[];
  /** A sigla da UF desta página. */
  destaque: string;
  valorDe: (p: PanoramaUf) => number | null;
  formatar: (v: number) => string;
  /** "% dos municípios que entregaram", para o rótulo acessível. */
  rotuloEixo: string;
  /** A frase completa que o leitor de tela ouve. */
  descricao: string;
}) {
  const pontos = panorama
    .map((p) => ({ uf: p.uf, v: valorDe(p) }))
    .filter((x): x is { uf: string; v: number } => x.v !== null);
  if (pontos.length < 3) return null;

  const meu = pontos.find((x) => x.uf === destaque);
  const min = Math.min(...pontos.map((x) => x.v));
  const max = Math.max(...pontos.map((x) => x.v));
  const vao = Math.max(max - min, 0.001);
  const x = (v: number) => M.esq + ((v - min) / vao) * (L - M.esq - M.dir);
  const y = M.topo + (A - M.topo - M.base) / 2;

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={descricao}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <title>{rotuloEixo}</title>

      {/* O eixo. Fino e fraco: é referência, não assunto. */}
      <line
        x1={M.esq} x2={L - M.dir} y1={y} y2={y}
        stroke="var(--borda-forte)" strokeWidth="1"
      />

      {/* Os outros 26. Pontos pequenos, sem rótulo: nomear os 27 numa tira de
          320 unidades produziria uma parede de siglas ilegível. Quem quiser o
          nome de um vizinho tem a tabela de estados na capa. */}
      {pontos
        .filter((p) => p.uf !== destaque)
        .map((p) => (
          <circle
            key={p.uf}
            cx={x(p.v)} cy={y} r="2.6"
            fill="var(--borda-forte)"
            opacity="0.75"
          />
        ))}

      {meu && (
        <g>
          <line
            x1={x(meu.v)} x2={x(meu.v)}
            y1={y - 9} y2={y + 9}
            stroke="var(--acento)" strokeWidth="1.5"
          />
          {/* Losango, e não círculo maior: em preto e branco, ou para quem não
              distingue a cor, a FORMA é o que separa este ponto dos outros. */}
          <path
            d={`M ${x(meu.v)} ${y - 5} L ${x(meu.v) + 5} ${y} L ${x(meu.v)} ${y + 5} L ${x(meu.v) - 5} ${y} Z`}
            fill="var(--acento)"
          />
          <text
            x={Math.min(Math.max(x(meu.v), 12), L - 12)}
            y={y - 11}
            textAnchor="middle"
            fontSize="8"
            fontWeight="600"
            fill="var(--acento)"
          >
            {meu.uf} {formatar(meu.v)}
          </text>
        </g>
      )}

      {/* Os extremos, para a tira ter escala. */}
      <text x={M.esq} y={A - 3} fontSize="7" fill="var(--tinta-fraca)">
        {formatar(min)}
      </text>
      <text
        x={L - M.dir} y={A - 3} textAnchor="end"
        fontSize="7" fill="var(--tinta-fraca)"
      >
        {formatar(max)}
      </text>
    </svg>
  );
}

/** `br` reexportado para o formatador padrão de percentual da tira. */
export const pct = (casas = 0) => (v: number) => `${br(v, casas)}%`;
