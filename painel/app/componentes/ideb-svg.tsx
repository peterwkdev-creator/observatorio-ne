import { br } from "../../lib/dados";
import type { Trajetoria } from "../../lib/ideb";

/**
 * A trajetória do IDEB contra a meta do INEP, em SVG embutido.
 *
 * Sem biblioteca e sem JavaScript, como o gráfico da série fiscal.
 *
 * ## A escala é FIXA de 0 a 10, e isso é o oposto do outro gráfico
 *
 * O sparkline da despesa com pessoal ancora nos limites legais porque não há
 * escala natural para um percentual de receita. **O IDEB tem:** ele é definido
 * entre 0 e 10, e essa escala é a mesma para todo município do país.
 *
 * Ancorar nos dados aqui seria mentir por exagero — uma variação de 4,9 para
 * 5,1 ocuparia o gráfico inteiro e pareceria um salto. Com o eixo fixo, duas
 * páginas de municípios diferentes são **diretamente comparáveis**, que é
 * justamente o que um índice padronizado permite e um percentual não permite.
 *
 * ## A meta é linha tracejada, não segunda série
 *
 * Duas linhas cheias fariam o leitor comparar a forma delas; o que importa é a
 * distância entre uma e outra em cada edição. E as edições **sem meta** (2005 e
 * 2023) simplesmente não recebem marca — inventar um alvo para interpolar seria
 * pior que a lacuna.
 */

const L = 320;
const A = 96;
const M = { topo: 8, base: 20, esq: 22, dir: 6 };
const TETO = 10;

export default function IdebSvg({
  trajetoria,
  municipio,
}: {
  trajetoria: Trajetoria;
  municipio: string;
}) {
  const { pontos } = trajetoria;
  if (pontos.length < 2) return null;

  const anos = pontos.map((p) => p.edicao);
  const minAno = Math.min(...anos);
  const maxAno = Math.max(...anos);
  const vao = Math.max(maxAno - minAno, 1);

  const x = (ano: number) =>
    M.esq + ((ano - minAno) / vao) * (L - M.esq - M.dir);
  const y = (v: number) =>
    M.topo + ((TETO - v) / TETO) * (A - M.topo - M.base);

  const linha = pontos
    .map((p, i) => `${i ? "L" : "M"}${x(p.edicao)},${y(p.observado)}`)
    .join(" ");

  const comMeta = pontos.filter((p) => p.projecao !== null);
  const linhaMeta = comMeta
    .map((p, i) => `${i ? "L" : "M"}${x(p.edicao)},${y(p.projecao as number)}`)
    .join(" ");

  const rotulo =
    `IDEB de ${municipio}, ${trajetoria.rotuloEtapa}, rede municipal: ` +
    pontos.map((p) => `${p.edicao}, ${br(p.observado, 1)}`).join("; ") +
    `. A escala vai de 0 a 10. ` +
    (comMeta.length
      ? `A linha tracejada é a meta do INEP, publicada em ${
          comMeta.length
        } das ${pontos.length} edições. `
      : "") +
    `Os mesmos valores estão na tabela abaixo.`;

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      role="img"
      aria-label={rotulo}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* As réguas de 0, 5 e 10. Com escala fixa elas são as mesmas em todo
          município, e é isso que torna duas páginas comparáveis. */}
      {[0, 5, TETO].map((v) => (
        <g key={v}>
          <line
            x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)}
            stroke="var(--borda)" strokeWidth="1"
          />
          <text
            x={M.esq - 4} y={y(v) + 3} textAnchor="end"
            fontSize="8" fill="var(--tinta-fraca)"
          >
            {v}
          </text>
        </g>
      ))}

      {linhaMeta && (
        <path
          d={linhaMeta}
          fill="none"
          stroke="var(--tinta-fraca)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}

      <path
        d={linha}
        fill="none"
        stroke="var(--acento)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {pontos.map((p, i) => (
        <circle
          key={p.edicao}
          cx={x(p.edicao)} cy={y(p.observado)}
          r={i === pontos.length - 1 ? 3.5 : 2}
          fill="var(--acento)"
        />
      ))}

      <text x={M.esq} y={A - 4} fontSize="8" fill="var(--tinta-fraca)">
        {minAno}
      </text>
      <text
        x={L - M.dir} y={A - 4} fontSize="8" textAnchor="end"
        fill="var(--tinta-fraca)"
      >
        {maxAno}
      </text>
      {comMeta.length > 0 && (
        <text
          x={(L + M.esq) / 2} y={A - 4} fontSize="8" textAnchor="middle"
          fill="var(--tinta-fraca)"
        >
          — — meta do INEP
        </text>
      )}
    </svg>
  );
}
