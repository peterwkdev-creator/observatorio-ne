import { br } from "../../lib/dados";
import type { Posicao } from "../../lib/posicao";

/**
 * Onde este município cai na distribuição do seu estado.
 *
 * Um tipo de gráfico diferente dos outros dois do site, porque responde uma
 * pergunta diferente. O sparkline mostra **um município ao longo do tempo**; a
 * tabela de funções mostra **as partes de um todo**. Este mostra **um caso
 * dentro de uma população** — e é o único que responde "isso é muito?".
 *
 * ## Histograma, e não pontos
 *
 * Com 217 municípios, plotar um ponto para cada produz uma faixa borrada onde
 * não se distingue concentração. O histograma mostra a forma da distribuição:
 * se o estado inteiro se amontoa perto do teto legal, isso salta aos olhos, e
 * é exatamente o que um número sozinho esconde.
 *
 * ## As duas réguas ficam, e a terceira é o próprio município
 *
 * Sem os limites legais, o histograma seria uma curva bonita sem consequência.
 * Com eles, dá para ver **quantos** estão do lado errado, não só se este está.
 *
 * ## O que se recusa a fazer
 *
 * **Não ordena e não classifica.** A barra deste município é destacada por
 * posição e por rótulo, não por cor de alerta — a página não está dizendo que
 * ele é melhor ou pior que os vizinhos, só onde ele cai. Julgar é do leitor;
 * o painel põe a régua.
 */

const L = 320;
const A = 96;
//: `base` reserva espaço para DUAS linhas de rótulo escalonadas mais a
//: escala do eixo. Ver a nota dos rótulos, mais abaixo.
const M = { topo: 6, base: 28, esq: 4, dir: 4 };
const FAIXAS = 24;

export default function DistribuicaoSvg({
  posicao,
  percentual,
  prudencial,
  legal,
  municipio,
  conjunto,
}: {
  posicao: Posicao;
  percentual: number;
  prudencial: number;
  legal: number;
  municipio: string;
  /** "do Maranhão", para o rótulo acessível. */
  conjunto: string;
}) {
  const { valores, base, percentil, mediana } = posicao;
  const min = Math.min(...valores, percentual);
  const max = Math.max(...valores, percentual, legal);
  const vao = Math.max(max - min, 1);

  // Contagem por faixa. `Math.min` na última para o valor máximo não cair
  // num índice fora do array.
  const contagem = new Array<number>(FAIXAS).fill(0);
  for (const v of valores) {
    const i = Math.min(FAIXAS - 1, Math.floor(((v - min) / vao) * FAIXAS));
    contagem[i] = (contagem[i] ?? 0) + 1;
  }
  const pico = Math.max(...contagem, 1);

  const x = (v: number) => M.esq + ((v - min) / vao) * (L - M.esq - M.dir);
  const larguraFaixa = (L - M.esq - M.dir) / FAIXAS;
  const alturaUtil = A - M.topo - M.base;
  const y = (n: number) => M.topo + alturaUtil - (n / pico) * alturaUtil;

  const rotulo =
    `Distribuição do gasto com pessoal ${conjunto}: ${base} municípios com ` +
    `relatório entregue e valor plausível. A mediana é ${br(mediana, 2)}% e ` +
    `${municipio} está em ${br(percentual, 2)}%, acima de ${br(percentil, 0)}% ` +
    `deles. O limite prudencial é ${br(prudencial, 2)}% e o teto legal ` +
    `${br(legal, 2)}%.`;

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* As colunas do histograma. Cinza: elas são o contexto, não o assunto. */}
      {contagem.map((n, i) =>
        n === 0 ? null : (
          <rect
            key={i}
            x={M.esq + i * larguraFaixa + 0.5}
            y={y(n)}
            width={Math.max(larguraFaixa - 1, 1)}
            height={M.topo + alturaUtil - y(n)}
            fill="var(--borda-forte)"
            opacity="0.55"
          />
        ),
      )}

      {/* As duas réguas legais, tracejadas como nos outros gráficos do site. */}
      {/* Os rótulos ficam em ALTURAS diferentes, e não lado a lado.
          Os dois limites distam 2,7 pontos percentuais (51,30 e 54,00), então
          numa escala que costuma cobrir 30 pontos eles caem a poucos pixels um
          do outro — e "prudencial" colidia com "teto legal" em **toda** página.
          Escalonar resolve sem encurtar o texto nem esconder um deles. */}
      {[
        { v: prudencial, texto: "prudencial", linha: 0 },
        { v: legal, texto: "teto legal", linha: 1 },
      ].map(({ v, texto, linha }) =>
        v < min || v > max ? null : (
          <g key={texto}>
            <line
              x1={x(v)} x2={x(v)} y1={M.topo} y2={M.topo + alturaUtil + linha * 7}
              stroke="var(--tinta-fraca)" strokeWidth="1" strokeDasharray="3 3"
            />
            <text
              x={x(v) + 2} y={M.topo + alturaUtil + 6 + linha * 7}
              textAnchor="start" fontSize="7" fill="var(--tinta-fraca)"
            >
              {texto}
            </text>
          </g>
        ),
      )}

      {/* Este município: linha cheia e marcador. Destacado por FORMA e
          posição, não por cor de alerta -- o gráfico situa, não julga. */}
      <line
        x1={x(percentual)} x2={x(percentual)}
        y1={M.topo - 3} y2={M.topo + alturaUtil}
        stroke="var(--acento)" strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(percentual)} cy={M.topo - 3} r="3.5" fill="var(--acento)" />

      <text x={M.esq} y={A - 2} fontSize="7" fill="var(--tinta-fraca)">
        {br(min, 0)}%
      </text>
      <text
        x={L - M.dir} y={A - 2} textAnchor="end"
        fontSize="7" fill="var(--tinta-fraca)"
      >
        {br(max, 0)}%
      </text>
    </svg>
  );
}
