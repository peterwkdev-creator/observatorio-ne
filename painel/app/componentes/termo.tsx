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

/** Impressão curta e estável do texto, para compor um id único. */
function impressao(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i += 1) {
    h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

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
  // **O id sai do CONTEÚDO, não só da âncora.** Medido em 03/09/2026 numa
  // auditoria do HTML gerado: a página de município usava `ancora="pessoal"`
  // duas vezes — no cartão da RCL e no "limite prudencial" do texto — e as
  // duas dicas nasciam com `id="dica-pessoal"`.
  //
  // Não é só HTML inválido: `aria-describedby` resolve para o **primeiro**
  // elemento com aquele id, então o leitor de tela anunciava a explicação da
  // RCL ao chegar no limite prudencial. Erro silencioso, e só para quem depende
  // do leitor de tela — a classe de defeito mais fácil de nunca descobrir.
  //
  // Duas dicas com o mesmo texto compartilharem o id é inofensivo: o conteúdo
  // é o mesmo, e é isso que o id promete.
  const id = `dica-${ancora}-${impressao(dica)}`;
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
