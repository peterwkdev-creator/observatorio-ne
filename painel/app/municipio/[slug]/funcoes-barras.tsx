import { br, escala } from "../../../lib/dados";
import type { FatiaFuncao } from "../../../lib/fiscal";
import estilos from "./municipio.module.css";

/**
 * Para onde vai o dinheiro do município, por função orçamentária.
 *
 * Uma tabela, não um gráfico de pizza. Pizza obriga a comparar ângulos, que é
 * a comparação que o olho faz pior — e com catorze fatias vira decoração. Aqui
 * a barra e o número dividem a mesma linha: quem lê rápido usa a barra, quem
 * precisa do valor exato lê a coluna ao lado, e quem usa leitor de tela recebe
 * uma tabela de verdade, com cabeçalho e escopo.
 *
 * ## A barra é `<div>`, não imagem nem SVG
 *
 * Largura em porcentagem, sem JavaScript e sem requisição. E `aria-hidden`:
 * a barra **repete** o número da célula vizinha; anunciada, seria a mesma
 * informação duas vezes na mesma linha.
 *
 * ## Por que a cauda é agrupada, e não cortada
 *
 * As funções menores somam pouco mas são muitas. Listar as 24 empurraria o
 * resto da página para fora da tela; cortá-las em silêncio faria a soma das
 * fatias exibidas não fechar com 100%, e o leitor que somasse concluiria que o
 * painel erra. A linha "outras N funções" resolve os dois: nada some, e a
 * coluna continua fechando.
 */

/** Quantas funções aparecem nomeadas antes de a cauda virar uma linha só. */
const NOMEADAS = 8;

export default function FuncoesBarras({
  fatias,
  total,
  municipio,
}: {
  fatias: FatiaFuncao[];
  total: number | null;
  municipio: string;
}) {
  if (fatias.length === 0) return null;

  const cabeca = fatias.slice(0, NOMEADAS);
  const cauda = fatias.slice(NOMEADAS);
  const somaCauda = cauda.reduce((s, f) => s + f.valor, 0);
  const pctCauda = total && total > 0 ? (somaCauda * 100) / total : null;

  // A barra mais longa é a maior fatia, não 100%. Com a maior valendo 38%, uma
  // escala até 100 deixaria todas as barras comprimidas no primeiro terço e a
  // diferença entre a 3ª e a 4ª -- que é o que se quer ver -- sumiria.
  const maior = Math.max(...fatias.map((f) => f.valor), somaCauda);
  const largura = (v: number) =>
    maior > 0 ? `${Math.max((v * 100) / maior, 1.5)}%` : "0%";

  const linha = (nome: string, valor: number, pct: number | null, chave: string) => (
    <tr key={chave}>
      <th scope="row">{nome}</th>
      <td className={`${estilos.num} tabular`}>{pct === null ? "—" : `${br(pct, 1)}%`}</td>
      <td className={`${estilos.num} tabular`} title={escala(valor).exato}>
        {escala(valor).curto}
      </td>
      <td className={estilos.trilho}>
        <div className={estilos.barra} style={{ width: largura(valor) }} aria-hidden="true" />
      </td>
    </tr>
  );

  return (
    <table className={estilos.funcoes}>
      <caption className="so-leitor">
        Despesa liquidada por função em {municipio}, da maior para a menor.
      </caption>
      <thead>
        <tr>
          <th scope="col">Função</th>
          <th scope="col" className={estilos.num}>% do gasto</th>
          <th scope="col" className={estilos.num}>Em reais</th>
          {/* A coluna da barra não tem título porque não tem conteúdo próprio
              — ela desenha a coluna anterior. Um cabeçalho vazio precisa ser
              declarado assim mesmo, senão o leitor de tela anuncia a célula
              da barra sob o rótulo "Em reais". */}
          {/* A mesma classe do `<td>`: sem ela, a media query que esconde a
              barra em tela estreita deixaria o cabeçalho com uma coluna a mais
              que o corpo, e a tabela desalinharia inteira. */}
          <th scope="col" className={estilos.trilho}>
            <span className="so-leitor">Proporção</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {cabeca.map((f) => linha(f.nome, f.valor, f.percentual, f.nome))}
        {cauda.length > 0 &&
          linha(
            `outras ${cauda.length} ${cauda.length === 1 ? "função" : "funções"}`,
            somaCauda,
            pctCauda,
            "__cauda",
          )}
      </tbody>
    </table>
  );
}
