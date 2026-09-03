import { br } from "../../../lib/dados";
import { pontoPlausivel, rotuloPeriodo, type PontoSerie } from "../../../lib/fiscal";

/**
 * A série de despesa com pessoal como um traço, em SVG embutido.
 *
 * Sem biblioteca e sem JavaScript: é um `<svg>` no HTML, gerado no build.
 * Uma biblioteca de gráfico custaria mais bytes que a página inteira para
 * desenhar seis pontos.
 *
 * ## A escala vertical, que é onde um gráfico mente com mais facilidade
 *
 * Um eixo começando em zero comprimiria tudo: os valores vivem entre 30% e 70%,
 * e a variação que interessa sumiria numa faixa fina no alto. Um eixo colado
 * nos dados faria o contrário — exageraria meio ponto percentual até parecer
 * despencada.
 *
 * A saída é **ancorar nos limites legais**, não nos dados: a escala vai do
 * menor entre (dados, limite prudencial) ao maior entre (dados, teto legal), e
 * as duas linhas de limite são **desenhadas**. O leitor não precisa confiar na
 * escala, porque vê a régua junto com a medida — e a pergunta real ("está acima
 * do limite?") passa a ser respondida pela posição, não por um número.
 *
 * ## O que fica de fora
 *
 * Pontos implausíveis (fora de 0–100%) **não entram na linha**. Guaratinga/BA
 * declarou 371%: plotado, achataria os outros cinco pontos contra o eixo e o
 * gráfico viraria uma linha reta com um pico. Eles continuam visíveis na tabela
 * logo abaixo, marcados — é lá que a declaração aparece, não aqui.
 *
 * ## Acessibilidade
 *
 * `role="img"` com `aria-label` que diz a tendência em palavras, e a tabela de
 * apoio logo abaixo com todos os valores. A orientação oficial para painéis de
 * dado público exige as duas coisas, não uma ou outra.
 */

const L = 300;   // largura do viewBox; o SVG escala para o container
const A = 72;    // altura
const M = { topo: 10, base: 18, esq: 4, dir: 4 };

export default function SerieSvg({
  pontos,
  prudencial,
  legal,
  municipio,
}: {
  pontos: PontoSerie[];
  prudencial: number;
  legal: number;
  municipio: string;
}) {
  const bons = pontos.filter(pontoPlausivel);
  if (bons.length < 2) return null;

  const valores = bons.map((p) => p[3]);
  const min = Math.min(...valores, prudencial);
  const max = Math.max(...valores, legal);
  const folga = Math.max((max - min) * 0.15, 1);
  const baixo = min - folga;
  const alto = max + folga;

  const x = (i: number) =>
    M.esq + (i * (L - M.esq - M.dir)) / Math.max(bons.length - 1, 1);
  const y = (v: number) =>
    M.topo + ((alto - v) / (alto - baixo)) * (A - M.topo - M.base);

  const linha = bons.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[3])}`).join(" ");
  const primeiro = bons[0]!;
  const ultimo = bons[bons.length - 1]!;
  const subiu = ultimo[3] > primeiro[3];

  const rotulo =
    `Despesa com pessoal de ${municipio} em ${bons.length} quadrimestres: ` +
    bons.map((p) => `${rotuloPeriodo(p[0], p[1])}, ${br(p[3], 2)}%`).join("; ") +
    `. ${subiu ? "Terminou acima" : "Terminou abaixo"} do primeiro valor. ` +
    `Limite prudencial ${br(prudencial, 2)}%, teto legal ${br(legal, 2)}%. ` +
    `Os mesmos valores estão na tabela abaixo.`;

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      // SEM `preserveAspectRatio="none"`. O viewBox tem 300 de largura e o
      // container passa de 500px: esticar sem manter proporção deformaria os
      // rótulos das réguas em ~1,8x na horizontal. Escala uniforme, altura
      // automática -- o traço perde nada e o texto continua legível.
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* As duas réguas. Tracejadas para não competir com o dado. */}
      {[
        { v: legal, cor: "var(--alerta)", texto: "teto legal" },
        { v: prudencial, cor: "var(--atencao)", texto: "prudencial" },
      ].map(({ v, cor, texto }) => (
        <g key={texto}>
          <line
            x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)}
            stroke={cor} strokeWidth="1" strokeDasharray="3 3" opacity="0.75"
          />
          <text
            x={L - M.dir} y={y(v) - 3} textAnchor="end"
            fontSize="8" fill={cor} opacity="0.9"
          >
            {texto} {br(v, 1)}%
          </text>
        </g>
      ))}

      <path
        d={linha}
        fill="none"
        stroke="var(--acento)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {bons.map((p, i) => (
        <circle
          key={`${p[0]}-${p[1]}`}
          cx={x(i)} cy={y(p[3])}
          r={i === bons.length - 1 ? 3.5 : 2}
          fill="var(--acento)"
        />
      ))}

      {/* Só o primeiro e o último rótulo: seis datas no eixo viram borrão. */}
      <text x={M.esq} y={A - 4} fontSize="8" fill="var(--tinta-fraca)">
        {rotuloPeriodo(primeiro[0], primeiro[1])}
      </text>
      <text x={L - M.dir} y={A - 4} fontSize="8" textAnchor="end" fill="var(--tinta-fraca)">
        {rotuloPeriodo(ultimo[0], ultimo[1])}
      </text>
    </svg>
  );
}
