import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Snapshot } from "./dados";
import type { SnapshotFiscal } from "./fiscal";

/**
 * Leitura do snapshot gerado pelo motor Python. **Só no servidor.**
 *
 * Roda no build, num Server Component: o arquivo é lido do disco, não buscado
 * por rede. O visitante recebe HTML pronto, e o painel não tem responsabilidade
 * nenhuma de coletar dado — é a costura desenhada no ESPEC.md entre as duas
 * linguagens.
 *
 * Fica separado de `lib/dados.ts` porque aquele é importado também pelo
 * componente de cliente, e `node:fs` não pode ir para o navegador.
 */

let cache: Snapshot | null = null;

export async function lerSnapshot(): Promise<Snapshot> {
  if (cache) return cache;
  const arquivo = path.join(process.cwd(), "dados", "snapshot.json");
  cache = JSON.parse(await readFile(arquivo, "utf-8")) as Snapshot;
  return cache;
}

/**
 * O snapshot fiscal, entregue pelo motor do `sys-painel-fiscal` e versionado
 * aqui como `dados/fiscal.json`. Mesma leitura de disco no build, mesma razão.
 */
let cacheFiscal: SnapshotFiscal | null = null;

export async function lerFiscal(): Promise<SnapshotFiscal> {
  if (cacheFiscal) return cacheFiscal;
  const arquivo = path.join(process.cwd(), "dados", "fiscal.json");
  cacheFiscal = JSON.parse(await readFile(arquivo, "utf-8")) as SnapshotFiscal;
  return cacheFiscal;
}

/**
 * O endereço canônico do site, em variável de ambiente.
 *
 * Cravar `observatorio-ne.vercel.app` no código significaria reescrever 1.794
 * tags `canonical` no dia em que um domínio próprio entrasse -- e é justamente
 * por causa desse dia que a variável existe. O `.vercel.app` e um dominio
 * compartilhado, sem autoridade propria e que a Vercel pode reatribuir a outro
 * usuario; sair dele e questao de quando, nao de se.
 */
export const SITE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://observatorio-ne.vercel.app";
