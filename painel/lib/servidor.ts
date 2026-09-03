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
 * O dominio proprio entrou em 03/09/2026: `numerospublicos.com.br`, registrado
 * no registro.br. O canonical e o `www`, e nao a raiz, porque `www` e um CNAME
 * que acompanha a Vercel sozinho -- a raiz seria um registro A com IP fixo, e a
 * propria Vercel avisa que esta expandindo a faixa de IPs. Site que quebra
 * quando um IP muda exige manutencao manual, que e o oposto do objetivo.
 *
 * A variavel continua existindo porque cravar endereco no codigo significaria
 * reescrever 1.794 tags `canonical` na proxima mudanca.
 */
export const SITE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://www.numerospublicos.com.br";
