import estilos from "./termo.module.css";

/**
 * Um termo técnico com a explicação a um passe de mouse — e a um toque, e a um
 * Tab.
 *
 * ## Por que não é só um `title`
 *
 * O atributo `title` do HTML dá exatamente o que se pede ("ajuda no hover") e
 * falha em tudo o mais: não aparece no toque, não aparece no foco de teclado,
 * demora ~1 s para surgir, não pode ser estilizado e some sozinho. Um site cuja
 * tese é *procedência* não pode esconder a explicação de quem usa o celular.
 *
 * ## Os três caminhos, e nenhum depende de JavaScript
 *
 * | Como se chega | O que acontece |
 * |---|---|
 * | **Mouse** | `:hover` revela a dica ao lado do termo |
 * | **Teclado** | `:focus-visible` revela a mesma dica |
 * | **Toque** | o toque **navega** para a seção completa da ajuda |
 * | **Leitor de tela** | `aria-describedby` lê a explicação junto do termo |
 *
 * O toque levar para a página de ajuda não é um consolo: é a melhor resposta
 * possível. Num celular não existe estado intermediário entre "não pedi" e
 * "quero saber", e quem tocou já disse que quer saber.
 *
 * ## O elemento é um `<a>`, e isso restringe onde ele pode ir
 *
 * Âncora não aninha dentro de âncora. Este componente **não pode** ficar dentro
 * de um `<Link>` — o React não avisa, o HTML fica inválido e o navegador
 * desmonta a marcação de um jeito que ninguém previu.
 */

export default function Termo({
  ancora,
  dica,
  bloco = false,
  children,
}: {
  /** O `id` da seção em `/ajuda/` que explica isto por inteiro. */
  ancora: string;
  /** Uma frase. Se precisar de duas, o lugar é a página de ajuda. */
  dica: string;
  /**
   * A dica vira bloco no fluxo, em vez de flutuar.
   *
   * **Obrigatório dentro de cartão.** Medido em 03/09/2026: um termo num
   * cartão da grade da página de estado abria a dica em `right = 1167` numa
   * janela de 920 — o cartão é estreito e a dica flutuante de 24rem sai da
   * tela por cima dele, criando rolagem horizontal na página inteira. Não há
   * como virar o lado sem medir a posição, e medir posição é JavaScript.
   *
   * Em parágrafo de texto (coluna de 68ch, alinhada à esquerda) a flutuante
   * cabe sempre, e ali ela é melhor: não empurra o texto.
   */
  bloco?: boolean;
  children: React.ReactNode;
}) {
  const id = `dica-${ancora}`;
  return (
    <a
      className={`${estilos.termo} ${bloco ? estilos.emBloco : ""}`}
      href={`/ajuda/#${ancora}`}
      aria-describedby={id}
    >
      {children}
      {/* `role="tooltip"` e `aria-describedby` no lugar de `title`: o leitor de
          tela lê a explicação junto do termo, sem depender de hover nenhum. */}
      <span className={estilos.dica} id={id} role="tooltip">
        {dica}
        <span className={estilos.mais}>Ler mais na ajuda →</span>
      </span>
    </a>
  );
}
