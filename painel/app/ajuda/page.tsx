import type { Metadata } from "next";
import Link from "next/link";

import { br, expandir } from "../../lib/dados";
import { FUNCOES_DA_PORTARIA, LIMITE_PLAUSIVEL } from "../../lib/fiscal";
import { lerFiscal, lerIdeb, lerSnapshot, SITE } from "../../lib/servidor";
import estilos from "./ajuda.module.css";

/**
 * A página de ajuda — o que fazer quando o número não se explica sozinho.
 *
 * Um painel de dado público falha de um jeito específico: o número está certo,
 * a fonte está citada, e o leitor mesmo assim não sabe o que está vendo. "RCL
 * ajustada", "despesa liquidada", "limite prudencial" e um travessão no lugar
 * de um valor são todos opacos para quem não trabalha com contabilidade
 * pública — que é praticamente todo mundo que chega aqui por uma busca.
 *
 * ## Três decisões de desenho
 *
 * **As perguntas são as reais, não as convenientes.** "Por que aparece um
 * travessão" e "achei um número errado" são as duas que mais aparecem em
 * qualquer painel de dado, e as duas que mais tentam ser evitadas.
 *
 * **Cada resposta diz TAMBÉM onde a resposta não está aqui.** Metade das
 * dúvidas de um site assim não é sobre o site: é sobre o que o município
 * declarou, e isso só a prefeitura e o SICONFI respondem. Mandar a pessoa para
 * o lugar certo é mais útil que uma resposta educada e inútil.
 *
 * **Os números da página são calculados, não escritos à mão.** Uma ajuda que
 * diz "1.794 municípios" em texto fixo vira mentira na próxima coleta, e
 * ninguém revisa a página de ajuda.
 */

const TITULO = "Ajuda — como ler os números deste site";

export const metadata: Metadata = {
  title: TITULO,
  description:
    "O que significa cada número: RCL ajustada, limite prudencial, despesa " +
    "liquidada, IDEB, e por que às vezes aparece um travessão.",
  alternates: { canonical: `${SITE}/ajuda/` },
  openGraph: {
    title: TITULO,
    description: "Como ler os números, de onde eles vêm e o que fazer com eles.",
    url: `${SITE}/ajuda/`,
    locale: "pt_BR",
    type: "article",
  },
};

export default async function PaginaAjuda() {
  const [snapshot, fiscal, ideb] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"),
  ]);
  const idebFinais = await lerIdeb("anos_finais");
  const total = expandir(snapshot).length;
  const c = fiscal.cobertura;
  const naoPublicaram = c.consultados - c.publicaram;
  const quadrimestre = `${fiscal.periodo}º quadrimestre de ${fiscal.exercicio}`;
  const f = fiscal.funcoes;

  // O efeito real dos implausíveis sobre a média nacional, CALCULADO.
  //
  // A frase aqui dizia que "um valor de 371% entre mil e quatrocentos puxa a
  // média quase um ponto inteiro" — conta feita quando só o Nordeste estava
  // varrido, e falsa depois: um valor entre 3.244 desloca 0,10 ponto. Número
  // cravado em prosa vira mentira na coleta seguinte, e ninguém revisa a
  // página de ajuda. Agora sai da conta.
  const declarados = fiscal.municipios
    .map((m) => m[5])
    .filter((v): v is number => typeof v === "number");
  const plausiveis = declarados.filter((v) => v > 0 && v <= 100);
  const implausiveis = declarados.length - plausiveis.length;
  const medi = (v: number[]) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
  const deslocamento = plausiveis.length
    ? medi(declarados) - medi(plausiveis)
    : 0;

  // `WebPage`, e deliberadamente NÃO `FAQPage`.
  //
  // A página tem treze perguntas e responderia ao formato, mas o `FAQPage`
  // exige repetir cada resposta como texto dentro do JSON-LD. Isso cria uma
  // segunda cópia do conteúdo, que se afasta da visível no primeiro ajuste de
  // redação — e dado estruturado que não bate com o que está na tela é
  // exatamente o que o Google trata como sinal ruim. Somando: o próprio Google
  // restringiu o resultado rico de FAQ a sites governamentais e de saúde em
  // 2023, então a duplicação seria paga sem nada em troca.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: TITULO,
    url: `${SITE}/ajuda/`,
    inLanguage: "pt-BR",
    isPartOf: { "@type": "WebSite", "@id": `${SITE}/#site` },
    about: { "@type": "Dataset", "@id": `${SITE}/#dados` },
    description:
      "Glossário e perguntas frequentes sobre os números publicados: RCL " +
      "ajustada, limites da Lei de Responsabilidade Fiscal, despesa " +
      "liquidada por função, IDEB e as convenções de ausência de dado.",
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">Ajuda</span>
      </nav>

      <header>
        <h1 className={estilos.titulo}>Ajuda</h1>
        <p className={estilos.chamada}>
          Este site publica números que os próprios municípios e o IBGE
          declararam. Alguns deles têm nomes técnicos que não se explicam
          sozinhos. Abaixo está o que cada um significa — e, quando a resposta
          não estiver aqui, para onde ir.
        </p>
      </header>

      <nav className={estilos.sumario} aria-label="Nesta página">
        <h2>Nesta página</h2>
        <ul>
          <li><a href="#travessao">Por que aparece “—” no lugar de um número</a></li>
          <li><a href="#pessoal">Despesa com pessoal, RCL e os dois limites</a></li>
          <li><a href="#implausivel">O que quer dizer “valor implausível”</a></li>
          <li><a href="#funcao">Despesa por função, e o que é “liquidada”</a></li>
          <li><a href="#comparacao">Por que a comparação é entre anos</a></li>
          <li><a href="#ideb">O que é o IDEB, e por que só a rede municipal</a></li>
          <li><a href="#inflacao">Os valores estão corrigidos pela inflação?</a></li>
          <li><a href="#quando">De quando são os dados</a></li>
          <li><a href="#faltando">Meu município não aparece</a></li>
          <li><a href="#cobertura">Quais municípios estão cobertos</a></li>
          <li><a href="#baixar">Como baixar e abrir os dados</a></li>
          <li><a href="#licenca">Posso usar estes dados?</a></li>
          <li><a href="#erro">Achei um número errado</a></li>
          <li><a href="#outras">Onde perguntar o que este site não responde</a></li>
        </ul>
      </nav>

      <section className={estilos.bloco} id="travessao">
        <h2>Por que aparece “—” no lugar de um número</h2>
        <p>
          Porque o dado <strong>não existe</strong> na fonte — e isso é
          diferente de ser zero.
        </p>
        <p>
          No {quadrimestre}, <strong>{br(naoPublicaram)}</strong> dos{" "}
          {br(c.consultados)} municípios consultados não entregaram o Relatório
          de Gestão Fiscal ao SICONFI. Isso não significa que gastem zero com
          pessoal: significa que ninguém sabe quanto gastam, porque o relatório
          não foi publicado.
        </p>
        <p>
          Escrever “0” ali seria inventar um número, e é assim que um painel
          passa a mentir sem que ninguém perceba. O travessão é a recusa a
          fazer isso.
        </p>
        <p>
          <strong>Mas nem todo travessão quer dizer a mesma coisa</strong>, e o
          site diz qual é qual em vez de juntar os três:
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>Sem relatório entregue</strong> — perguntamos, e o
            município não publicou. É afirmação sobre ele.
          </li>
          <li>
            <strong>Ainda não consultado</strong> — nós é que ainda não
            perguntamos. É afirmação sobre nós, e some quando a coleta fecha.
          </li>
          <li>
            <strong>Presta contas como estado</strong> — o ente entrega o
            relatório, só que na esfera estadual. É o caso do{" "}
            <strong>Distrito Federal</strong>, que a estatística conta como
            município mas que não é um: ele publica o Relatório de Gestão
            Fiscal como estado. Marcá-lo como “não entregou” seria acusar de
            não prestar contas quem presta.
          </li>
        </ul>
      </section>

      <section className={estilos.bloco} id="pessoal">
        <h2>Despesa com pessoal, RCL e os dois limites</h2>
        <p>
          <strong>Receita corrente líquida (RCL)</strong> é o que sobra da
          arrecadação do município depois de descontar transferências que ele é
          obrigado a repassar. A <strong>RCL ajustada</strong> é essa mesma
          conta com os ajustes que a Lei de Responsabilidade Fiscal manda fazer
          — e é ela, não a bruta, o denominador do percentual publicado.
        </p>
        <p>
          O percentual que este site mostra é{" "}
          <strong>despesa com pessoal ÷ RCL ajustada</strong>. A Lei de
          Responsabilidade Fiscal fixa dois patamares para o Executivo
          municipal:
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>{br(fiscal.limites.prudencial, 2)}% — limite prudencial.</strong>{" "}
            Passar dele já proíbe criar cargo, conceder aumento e contratar.
          </li>
          <li>
            <strong>{br(fiscal.limites.legal, 2)}% — teto legal.</strong>{" "}
            O limite máximo propriamente dito.
          </li>
        </ul>
        <p>
          <strong>Este site não recalcula o percentual.</strong> Ele vem
          calculado e declarado pelo próprio município e homologado no SICONFI.
          Recalcular criaria uma segunda verdade que ninguém assinou. E o site
          não interpreta, não acusa e não declara ninguém em descumprimento —
          mostra o número publicado ao lado do limite.
        </p>
      </section>

      <section className={estilos.bloco} id="implausivel">
        <h2>O que quer dizer “valor implausível”</h2>
        <p>
          É a marca que aparece quando o município declarou um percentual que
          nenhuma prefeitura pode ter: acima de {LIMITE_PLAUSIVEL}% (gastaria
          com pessoal mais do que toda a sua receita) ou abaixo de zero (gasto
          negativo).
        </p>
        <p>
          Os dois casos existem no dado real de 2024. Guaratinga/BA declarou{" "}
          <strong>371,02%</strong>; Paripueira/AL declarou despesa negativa e,
          portanto, <strong>−19,35%</strong>. Não descrevem prefeituras em
          crise: descrevem formulários preenchidos errado.
        </p>
        <p>
          Eles continuam sendo exibidos, e marcados. Corrigir seria inventar
          número; esconder seria escolher quais declarações você pode ver. Mas
          eles <strong>ficam fora das médias</strong> e das frases de
          tendência, e o motivo é medido: são{" "}
          <strong>{br(implausiveis)}</strong> declarações fora da faixa de 0 a
          100% entre as {br(declarados.length)} entregues, e juntas elas puxam
          a média nacional em <strong>{br(deslocamento, 2)} ponto</strong>
          {deslocamento >= 2 ? "s" : ""} — de {br(medi(plausiveis), 2)}% para{" "}
          {br(medi(declarados), 2)}%.
        </p>
      </section>

      <section className={estilos.bloco} id="funcao">
        <h2>Despesa por função, e o que é “liquidada”</h2>
        <p>
          <strong>Função orçamentária</strong> é a área em que o dinheiro foi
          gasto: educação, saúde, urbanismo, assistência social. São{" "}
          {FUNCOES_DA_PORTARIA} funções fixadas pela Portaria MOG 42/1999, e
          todo município usa a mesma lista — é o que torna a comparação possível.
        </p>
        <p>
          <strong>Liquidada</strong> quer dizer o que de fato foi gasto: o
          serviço foi prestado ou o material entregue, e a prefeitura reconheceu
          a dívida. É diferente de <em>dotação</em> (o que foi orçado, ou seja,
          a intenção) e de <em>empenhada</em> (o dinheiro reservado). Só a
          liquidada responde “quanto gastou”.
        </p>
        {f && (
          <p>
            Os valores publicados aqui são do {f.periodo}º bimestre de{" "}
            {f.exercicio}, e <strong>acumulam o ano inteiro</strong> até ali —
            não são o gasto daqueles dois meses.
          </p>
        )}
      </section>

      <section className={estilos.bloco} id="comparacao">
        <h2>Por que a comparação é entre anos, e não entre bimestres</h2>
        <p>
          Porque o relatório é <strong>acumulado</strong>. O 6º bimestre já
          contém o 4º — medindo os {br(c.publicaram)} municípios que publicaram
          os dois, <strong>63% do valor do 6º bimestre é literalmente o do
          4º</strong>. Compará-los seria comparar um número com ele mesmo mais
          um pedaço, e a fatia de cada função mal se moveria: menos de um ponto
          percentual, na mediana.
        </p>
        <p>
          Entre o mesmo bimestre de dois anos diferentes, os períodos não se
          sobrepõem, e a mudança é real. É por isso que a página compara{" "}
          {f?.anterior ? `${f.anterior.exercicio}/${f.anterior.periodo} com ${f.exercicio}/${f.periodo}` : "o mesmo bimestre de dois anos"}.
        </p>
        <p>
          E a página só chama de mudança um deslocamento de{" "}
          <strong>1 ponto percentual ou mais</strong>. Abaixo disso ela diz que
          ficou praticamente igual — descrever movimento de meio ponto como
          tendência seria vender ruído como descoberta.
        </p>
      </section>

      <section className={estilos.bloco} id="ideb">
        <h2>O que é o IDEB, e por que só a rede municipal</h2>
        <p>
          O <strong>IDEB</strong> é o índice do INEP que combina duas coisas:
          quanto os alunos aprenderam (a prova do SAEB) e quantos avançaram de
          ano sem reprovar ou abandonar. Vai de <strong>0 a 10</strong>, e essa
          escala é a mesma em todo município do país — por isso os gráficos
          deste site usam eixo fixo, e duas páginas podem ser comparadas
          diretamente.
        </p>
        <p>
          Este site publica a <strong>rede municipal</strong>, e não a rede
          &ldquo;pública&rdquo;. A diferença importa: a rede pública inclui as
          escolas <em>estaduais</em>, que a prefeitura não administra nem
          financia. Como a página mostra ao lado quanto do orçamento{" "}
          <em>municipal</em> foi para educação, usar o índice da rede pública
          creditaria à prefeitura um resultado que não é dela.
        </p>
        <p>
          As <strong>etapas são separadas e não se comparam entre si</strong>.
          Anos iniciais (1º ao 5º) e anos finais (6º ao 9º) têm provas e
          escalas próprias, e as medianas dos dois conjuntos ficam a mais de um
          ponto de distância. Um número não é &ldquo;pior&rdquo; que o outro;
          eles medem coisas diferentes.
        </p>
        <p>
          <strong>2005 e {ideb.edicoes[ideb.edicoes.length - 1]} não têm
          meta</strong>, e travessão ali é ausência de alvo, não alvo não
          atingido. 2005 é a linha de base do índice; e o primeiro ciclo do
          IDEB encerrou em 2021, com as novas metas ainda em definição
          (Portaria MEC 26/2024).
        </p>
        <p>
          Algumas edições aparecem marcadas como{" "}
          <strong>&ldquo;com ressalva do INEP&rdquo;</strong>. É o próprio INEP
          avisando que aquela média foi calculada em condição atípica — por
          exemplo, com participação inferior a 50% na prova, ou a partir de
          avaliações estaduais por extravio das provas. O número é publicado
          como veio, com o aviso junto.
        </p>
        <p>
          Cobertura, contra os <strong>{br(snapshot.municipios.length)}</strong>{" "}
          municípios do país:
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>{br(ideb.cobertura.municipios)}</strong> têm rede municipal
            nos <strong>anos iniciais</strong> — faltam{" "}
            {br(snapshot.municipios.length - ideb.cobertura.municipios)}.
          </li>
          <li>
            <strong>{br(idebFinais.cobertura.municipios)}</strong> têm nos{" "}
            <strong>anos finais</strong> — faltam{" "}
            {br(snapshot.municipios.length - idebFinais.cobertura.municipios)},
            e essa é a diferença que surpreende: no Paraná,{" "}
            <strong>388 dos 399</strong> municípios não administram o 6º ao 9º
            ano.
          </li>
        </ul>
        <p>
          {/* "a rede é do estado" era afirmação categórica. Verificado em
              04/09/2026 reingerindo o arquivo do INEP com `--rede Estadual`:
              dos 138 sem rede municipal nos anos iniciais, 133 aparecem na
              estadual e 5 em nenhuma das duas. "Quase sempre" é o que o dado
              sustenta; "é" não era. */}
          Onde o município não administra aquela etapa, a rede é de outro ente
          — <strong>quase sempre a estadual</strong>. Conferimos: dos{" "}
          {br(snapshot.municipios.length - ideb.cobertura.municipios)} sem rede
          municipal nos anos iniciais, <strong>133 aparecem no próprio arquivo
          do INEP como rede estadual</strong>; cinco não aparecem em nenhuma das
          duas, e sobre esses não sabemos.
        </p>
        <p>
          Isso <strong>não é lacuna da coleta</strong>, e a página do município
          e a do estado dizem isso onde acontece — ver{" "}
          <a href="#faltando">meu município não aparece</a>.
        </p>
      </section>

      <section className={estilos.bloco} id="inflacao">
        <h2>Os valores estão corrigidos pela inflação?</h2>
        <p>
          <strong>Não.</strong> Todos os valores em reais são{" "}
          <strong>nominais</strong>, exatamente como foram declarados. Quando a
          página diz que o gasto de um município cresceu 13% de um ano para o
          outro, parte disso é inflação.
        </p>
        <p>
          Deflacionar exigiria escolher um índice e uma data-base, e essa
          escolha muda o resultado. Preferimos publicar o número declarado e
          dizer claramente o que ele é.
        </p>
      </section>

      <section className={estilos.bloco} id="quando">
        <h2>De quando são os dados</h2>
        <p>
          Cada número carrega a data em que foi coletado, ao lado dele, na
          página onde aparece. Não há dado sem procedência neste site.
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>População e PIB:</strong> IBGE — Censo 2022 e PIB municipal
            a preços correntes.
          </li>
          <li>
            <strong>Despesa com pessoal:</strong> SICONFI/Tesouro Nacional, RGF
            Anexo 01, {quadrimestre}
            {fiscal.coletadoEm ? `, coletado em ${fiscal.coletadoEm.slice(0, 10)}` : ""}.
          </li>
          {f && (
            <li>
              <strong>Despesa por função:</strong> SICONFI/Tesouro Nacional,
              RREO Anexo 02, {f.periodo}º bimestre de {f.exercicio}
              {f.coletadoEm ? `, coletado em ${f.coletadoEm.slice(0, 10)}` : ""}.
            </li>
          )}
        </ul>
      </section>

      <section className={estilos.bloco} id="faltando">
        <h2>Meu município não aparece, ou aparece sem alguns números</h2>
        <p>
          O site cobre <strong>{br(total)} municípios</strong> — todos os do
          Brasil segundo o IBGE. Se o seu não estiver, o mais provável é
          diferença de grafia na busca; tente pela{" "}
          <Link href="/" prefetch={false}>lista completa</Link> ou pela página do estado.
        </p>
        <p>
          Um caso é real e proposital: <strong>Fernando de Noronha</strong> tem
          página de município no IBGE mas é <em>distrito estadual</em> de
          Pernambuco, não município. Sem Executivo municipal, não entrega
          relatório fiscal — por isso aparece sem os números do Tesouro. As duas
          fontes estão certas: o IBGE conta território, o SICONFI conta quem
          presta contas.
        </p>
        <p>
          Município que existe mas está sem os números fiscais provavelmente não
          entregou o relatório — ver{" "}
          <a href="#travessao">por que aparece “—”</a>.
        </p>
        <p>
          E <strong>sem o IDEB é outra coisa</strong>, não a mesma ausência: o
          INEP publica por rede, e onde a prefeitura não administra aquelas
          escolas não há número municipal a publicar. Acontece em{" "}
          {br(snapshot.municipios.length - ideb.cobertura.municipios)}{" "}
          municípios nos anos iniciais e em{" "}
          {br(snapshot.municipios.length - idebFinais.cobertura.municipios)} nos
          anos finais — ver <a href="#ideb">o que é o IDEB</a>.
        </p>
      </section>

      <section className={estilos.bloco} id="cobertura">
        <h2>Quais municípios estão cobertos</h2>
        <p>
          <strong>Todos os {br(total)} do Brasil</strong>, segundo a lista de
          localidades do IBGE. A coleta começou pelo Nordeste, com verificação
          de cada número, e foi estendida ao país quando o método já estava
          conferido — não antes.
        </p>
        <p>
          Nem todo município aparece com todos os números, e a página sempre diz
          por quê. Um pode não ter entregue o relatório fiscal; outro pode não
          administrar escola de 1º ao 5º ano, e aí a rede é do estado. Ausência
          está sempre marcada — ver <a href="#travessao">por que aparece
          &ldquo;—&rdquo;</a>.
        </p>
      </section>

      <section className={estilos.bloco} id="baixar">
        <h2>Como baixar e abrir os dados</h2>
        <p>
          Todo número deste site pode ser baixado. Um painel de dado público que
          só deixa <em>olhar</em> está pela metade — número que ninguém consegue
          baixar é número que ninguém consegue contestar.
        </p>
        <ul className={estilos.lista}>
          <li>
            <a href="/dados/municipios.xlsx" download>
              Base completa em planilha do Excel
            </a>{" "}
            — os {br(total)} municípios, com três abas: os dados, o que
            significa cada coluna, e de onde cada número veio.
          </li>
          <li>
            <a href="/dados/municipios.csv" download>A mesma base em CSV</a> —
            para quem vai ler por programa.
          </li>
          <li>
            <strong>Por estado</strong> — o link está no fim de cada página de
            estado.
          </li>
          <li>
            <strong>Por município</strong> — no fim de cada página de município,
            com uma linha por indicador e período.
          </li>
        </ul>
        <p>
          Os arquivos usam <strong>ponto e vírgula</strong> como separador e{" "}
          <strong>vírgula</strong> como decimal, que é o que o Excel em
          português espera: basta abrir. Um CSV “padrão” internacional abriria
          com tudo amontoado numa coluna só.
        </p>
        <p>
          Se você for reimportar em outra ferramenta, o arquivo é UTF-8 com BOM.
          Municípios que não entregaram relatório aparecem como{" "}
          <code>nao</code> na coluna de publicação — nunca como zero.
        </p>
      </section>

      <section className={estilos.bloco} id="licenca">
        <h2>Posso usar estes dados?</h2>
        <p>
          Sim. Os dados de origem são públicos, e este site é software livre sob{" "}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener">
            AGPL-3.0
          </a>
          . Use, cite e redistribua.
        </p>
        <p>
          Se for republicar, cite as fontes originais — IBGE e SICONFI/Tesouro
          Nacional — e não só este site. É delas que o número vem.
        </p>
      </section>

      <section className={estilos.bloco} id="erro">
        <h2>Achei um número errado</h2>
        <p>
          Há duas possibilidades, e vale separar antes de mais nada:
        </p>
        <ul className={estilos.lista}>
          <li>
            <strong>O número aqui está diferente do que a fonte publica.</strong>{" "}
            Aí o erro é nosso, e queremos saber. Abra uma questão no{" "}
            <a
              href="https://github.com/peterwkdev-creator/observatorio-ne/issues"
              rel="noopener"
            >
              repositório do projeto
            </a>{" "}
            com o município e o número que você viu.
          </li>
          <li>
            <strong>O número aqui é igual ao da fonte, e a fonte é que está
            estranha.</strong> Aí o erro é da declaração, e nós não podemos
            corrigi-lo — seria inventar um valor. O caminho é a prefeitura ou o
            tribunal de contas do estado. Os casos mais gritantes já aparecem
            marcados como <a href="#implausivel">implausíveis</a>.
          </li>
        </ul>
        <p>
          Todo o código de coleta é aberto, então dá para conferir exatamente
          como cada número foi lido da API.
        </p>
      </section>

      <section className={estilos.bloco} id="outras">
        <h2>Onde perguntar o que este site não responde</h2>
        <p>
          Muita dúvida sobre estes dados não é sobre o site: é sobre o que o
          município declarou, ou sobre a regra que ele seguiu. Esses lugares
          respondem o que nós não temos como responder:
        </p>
        <ul className={estilos.lista}>
          <li>
            <a href="https://siconfi.tesouro.gov.br/" rel="noopener">
              SICONFI — Tesouro Nacional
            </a>{" "}
            — a fonte dos relatórios fiscais, com todos os anexos, não só os dois
            usados aqui.
          </li>
          <li>
            <a href="https://sidra.ibge.gov.br/" rel="noopener">IBGE / SIDRA</a>{" "}
            — população, PIB e todas as outras estatísticas municipais.
          </li>
          <li>
            <strong>A prefeitura do município</strong>, pelo portal da
            transparência ou pelo pedido de acesso à informação (Lei 12.527/2011)
            — é quem pode explicar uma declaração específica.
          </li>
          <li>
            <strong>O tribunal de contas do estado</strong> — é quem fiscaliza
            as contas municipais.
          </li>
        </ul>
      </section>

      <footer className={estilos.rodape}>
        <p>
          Ainda com dúvida? Abra uma questão no{" "}
          <a
            href="https://github.com/peterwkdev-creator/observatorio-ne/issues"
            rel="noopener"
          >
            repositório
          </a>
          . Não há formulário nem cadastro neste site — ele é estático de
          propósito, e não coleta nada sobre quem o visita.
        </p>
      </footer>
    </main>
  );
}
