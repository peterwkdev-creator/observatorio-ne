# Números Públicos

**Live at [www.numerospublicos.com.br](https://www.numerospublicos.com.br).**

Open data on **all 5,571 Brazilian municipalities** — ingested from official
IBGE public APIs, stored with full provenance, joined to municipal fiscal
filings from the National Treasury and to school results from INEP, and
published as **one static page per municipality**.

It started as a regional observatory for the Northeast (1,794 municipalities);
the national cut was always a flag, so the expansion was one command — and the
five latent defects it exposed are written up in the design notes below.

> **Status: published and scheduled.** Every figure is ingested from a live API,
> idempotent, cross-checked against IBGE's own regional aggregate, and rebuilt
> weekly by a GitHub Actions job that commits only when the data actually
> changed.

**5,571 indexable pages, not one.** The whole site used to be a single URL
holding every municipality behind a filter — which meant nobody searching for a
specific town could ever reach it. Each municipality now has its own address,
title, description and canonical, carrying population, GDP, personnel spending
against the legal limit and the school index, joined by the shared IBGE code.

The fiscal half comes from [painel-fiscal-ne](https://github.com/peterwkdev-creator/painel-fiscal-ne),
handed over as a versioned snapshot rather than fetched at build time: a build
that reached into another repository would fail silently the day that repository
moved.

## Independent work — no affiliation

Built against a **public** term of reference (TR 21/2026, project BRA/23/006,
published by UNDP Brazil for the Consórcio Nordeste) describing a regional
observatory that does not yet exist. This is **independent work with no
affiliation to, or endorsement by, the Consórcio Nordeste or UNDP**, and it is
not a bid, proposal or deliverable for that contract.

## Run it

Python 3.10+ and nothing else — standard library only, no install step.

```bash
python -m observatorio ingerir-municipios
```

Then:

```bash
python -m observatorio ingerir-indicador populacao-censo-2022
python -m observatorio observacoes pib-municipal --uf SE
python -m observatorio conferir             # integrity, against the source
python -m observatorio coletas              # ingestion history
```

## Integrity: checked against the source, not against itself

`conferir` compares the **sum of all municipalities** with the **regional total
IBGE itself publishes**. Verifying one city proves the parser is right; only the
sum proves the ingestion is *complete* — it catches a missing, duplicated or
mis-summed municipality in a single comparison.

Run against the live API on 2026-09-04, national cut (`--regiao BR`, IBGE's
own N1 aggregate):

| Indicator | Sum of municipalities | vs. IBGE national total |
|---|---|---|
| Population (2022 Census) | 203,080,756 | **exact** |
| Estimated population (2024) | 212,583,750 | **exact** |
| Municipal GDP (2021) | 9,012,142,031 (BRL thousands) | rounding, 31 (3.4e-09) |

**Exact equality is the wrong test for a rounded aggregate**, and the first real
run showed why: GDP came out 5 apart in 1,243,103,280 back when the cut was
regional, and 31 apart in 9,012,142,000 nationally — the absolute gap grows
with the sum, the relative one does not. IBGE publishes municipal
GDP already rounded to thousands and computes the regional total before
rounding. Widening the tolerance to hide that would be dishonest; the check
**classifies** instead — below 1e-6 relative it is rounding and says so with the
number, above it the command fails. The gap between the two cases is hundreds of
times over.

## Test it

```bash
python -m unittest discover -s tests -t .
```

56 tests, **no network and no real waiting** — the HTTP transport and the clock
are injected. The fixtures in `tests/fixtures/` are real captured responses from
the IBGE API: the 75 municipalities of Sergipe, the 2022 Census population of
Rio Grande do Norte, and the 2021 GDP of Sergipe.

## The panel

```bash
python -m observatorio exportar     # writes painel/dados/snapshot.json
cd painel && npm install && npm run build
```

Next.js 16 + React 19 + TypeScript, **fully static** (`output: "export"`) — no
server, no serverless function, no runtime data fetching. The build reads the
JSON snapshot from disk and emits HTML that already contains every number.
5,571 municipality pages plus 27 state pages build in **40 seconds**.

The one client component is the municipality table, because searching and
sorting 5,571 rows is the only thing here that genuinely needs JavaScript.

### Checking the build

Three commands, each verifying something the others cannot:

```bash
npm test           # the pure libraries: distribution maths, spreadsheet format
npm run typecheck  # tsc --noEmit
npm run auditar    # accessibility and SEO, against the GENERATED HTML
```

`npm test` uses the Node test runner over TypeScript that Node itself strips —
**no test dependency**. `npm run auditar` needs `npm run build` and the output
served on `:8791`; it drives a real browser through every page in **both colour
themes**, because a contrast bug that only exists in light mode is invisible to
a checker that only ever renders dark.

```bash
npm run conferir-xlsx   # opens the generated spreadsheet in LibreOffice
```

The `.xlsx` writer builds a ZIP of XML by hand, and a format error there raises
no exception — it produces a file Excel refuses to open. So the check hands the
file to LibreOffice, an independent implementation, converts it back to CSV and
compares the values. Requires LibreOffice on the PATH (or `SOFFICE=` pointing
at it).

**No CSS framework**, by decision: design tokens as custom properties plus CSS
Modules. One less dependency, and real control over typography — including
`font-variant-numeric: tabular-nums`, without which number columns wobble and
comparing values becomes work.

**Accessibility is not decoration here**: skip link, real table semantics with
`<th scope>`, sortable headers as actual `<button>`s (focus and keyboard for
free), `aria-sort` only on the active column, and `prefers-reduced-motion`
honoured.

## Every number is downloadable

A public-data panel that only lets you *look* is half a panel: a number nobody
can download is a number nobody can contest. Every figure ships in three shapes,
generated at build time as static files — no server, no API.

| File | Shape | For |
|---|---|---|
| `/dados/municipios.xlsx` | three sheets | anyone who opens spreadsheets |
| `/dados/municipios.csv` | wide, one row per municipality | anyone reading it by program |
| `/municipio/<slug>/dados.csv` | long, one observation per row | one town at a time |

**The CSVs use `;` and decimal commas, with a UTF-8 BOM.** Not pedantry: this
site's readers open Excel in a pt-BR locale, where a "standard" CSV lands
entirely in one column and, without the BOM, `Município` renders as `MunicÃ­pio`.

**The spreadsheet carries two sheets the CSV cannot.** One says what each column
means; the other says where each number came from and when it was collected. In
a CSV those would have to become a second file nobody downloads alongside the
first — and a number without provenance is exactly what this site exists not to
produce.

**An empty cell means ABSENT, never zero**, and that survives the download:
`pessoal_publicou` is `sim`/`nao`/`nao_consultado`, never blank. Collapsing "did
not file" into "we did not ask" would erase the distinction the whole panel is
built to keep.

The `.xlsx` is written without a dependency — the format is a ZIP of XML, and
Node ships `deflateRawSync` but no packer. That choice buys a verification
obligation, met by `npm run conferir-xlsx` above.

## Design notes

**Missing is not zero.** IBGE marks absent values with `-`, `...` or `X`. Those
become `NULL`, never `0` — conflating "we don't know" with "zero" is how a
dashboard starts lying without anyone noticing. Averages count only rows that
have a number.

**Provenance is a column, not a comment.** Every observation records when it was
collected and which endpoint it came from. A number with no traceable origin is
worthless in an observatory — that is what separates this from a scraper.

**Revisions do not overwrite.** IBGE revises GDP retroactively; a new collection
with a different value becomes another row, never a silent overwrite.

**Idempotent by construction.** Running twice changes nothing: proven in tests
and against the live API (second run: 0 new, every municipality already
known).

**Failure is expected, not exceptional.** The transport returns a status instead
of raising on network failure, so retry policy is actually consulted; a socket
`TimeoutError` is an `OSError`, not a `URLError`, and would otherwise escape it.

**One contract, tested from the Python side.** The TypeScript panel reads the
JSON snapshot at build time. If the Python export changes shape, the panel
breaks in another directory, in another language, with no warning — so
`tests/test_snapshot.py` asserts exactly the keys `type Snapshot` declares.

**Flat layout, deliberately.** The PyPA does not recommend `src/` over flat; it
states the trade-off, and the deciding one here is that *"the src layout
requires installation of the project to be able to run its code, and the flat
layout does not."* This project must run from a clean checkout with no install.

## License: AGPL-3.0-or-later, deliberately

Not MIT. This project can plausibly become a product: Brazilian municipalities
buy exactly this kind of public data portal, on continuous contracts, and the
three tender documents read in full price it at BRL 5,000–6,000 per month.

MIT would let anyone take this code, **close it**, rebrand it and sell it to
those same municipalities — including the incumbent vendors it would compete
with. AGPL keeps it open and inspectable, which is the entire point of
publishing it, while requiring anyone who offers it **as a service** to publish
their modifications. That is the clause MIT lacks and a SaaS market needs.

The copyright is held by one person, so dual licensing stays available:
AGPL for everyone, a commercial licence for anyone who needs it closed.

Note that this decision gets more expensive over time — relicensing later
requires the consent of **every** contributor.

## Data sources

All public, no registration, no token — `https://servicodados.ibge.gov.br`.
Every endpoint was called and returned real municipal data before being written
down; two aggregate/variable combinations returned HTTP 500 and were left out
rather than promised.

The fiscal figures come from SICONFI (`https://apidatalake.tesouro.gov.br`),
equally public and equally token-free. **The percentage of revenue committed to
personnel is never recalculated here** — it arrives computed and filed by the
municipality itself, over its *adjusted* net revenue. Filings that fall outside
0–100% of revenue are shown as filed and labelled implausible, because
correcting them would invent a number and hiding them would decide which
filings a reader may see.
