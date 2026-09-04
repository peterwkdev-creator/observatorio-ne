/**
 * Faz o Node achar `./fiscal` quando o arquivo é `./fiscal.ts`.
 *
 * O código do painel importa sem extensão porque é o bundler do Next que
 * resolve. O Node ESM exige a extensão, e a alternativa seria escrever `.ts`
 * em todo import do projeto **só para o teste rodar** — mudar o código de
 * produção para caber na ferramenta, que é a ordem errada.
 *
 * Quinze linhas de gancho, e nenhuma dependência nova.
 */
export async function resolve(especificador, contexto, proximo) {
  try {
    return await proximo(especificador, contexto);
  } catch (e) {
    if (especificador.startsWith(".") && !especificador.endsWith(".ts")) {
      return proximo(`${especificador}.ts`, contexto);
    }
    throw e;
  }
}
