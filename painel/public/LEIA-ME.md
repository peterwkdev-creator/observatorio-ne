# `public/`

Arquivos servidos na **raiz** do site, sem passar pelo build do Next.

## `f0aeb82722eec0f6b54f7d0c9b4274c8.txt`

A chave do [IndexNow](https://www.indexnow.org/). **Não é segredo** — o
protocolo exige que ela fique publicamente legível na raiz do domínio: é
justamente isso que prova ao buscador que quem submete URLs controla o site.
O `sincronizar.py` procura padrões de chave viva em arquivo versionado; esta
não é uma credencial, e por isso pode e deve estar aqui.

**O nome do arquivo tem de ser exatamente a chave, e o conteúdo também** — sem
quebra de linha no fim, sem BOM. O protocolo compara os dois.

**Trocar a chave quebra a verificação** e obriga a reenviar tudo. Ela fica.
