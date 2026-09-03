# Observatório NE

Open data on the **1,794 municipalities of Brazil's Northeast region** —
ingested from official IBGE public APIs, stored with full provenance, and
(from step 4) published as a static comparison panel.

> **Status: all four steps built.** 1,794 municipalities and three indicators
> ingested from the live API, idempotent, cross-checked against IBGE's own
> regional aggregate, and rendered as a static panel. Publishing and scheduling
> are next. Scope and acceptance criteria live in `ESPEC.md`.

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

| Indicator | Sum of municipalities | vs. IBGE regional total |
|---|---|---|
| Population (2022 Census) | 54,658,515 | **exact** |
| Estimated population (2024) | 57,112,096 | **exact** |
| Municipal GDP (2021) | 1,243,103,275 (BRL thousands) | rounding, 5 (4.0e-09) |

**Exact equality is the wrong test for a rounded aggregate**, and the first real
run showed why: GDP came out 5 apart in 1,243,103,280. IBGE publishes municipal
GDP already rounded to thousands and computes the regional total before
rounding. Widening the tolerance to hide that would be dishonest; the check
**classifies** instead — below 1e-6 relative it is rounding and says so with the
number, above it the command fails. The gap between the two cases is hundreds of
times over.

## Test it

```bash
python -m unittest discover -s tests -t .
```

55 tests, **no network and no real waiting** — the HTTP transport and the clock
are injected. The fixtures in `tests/fixtures/` are real captured responses from
the IBGE API: the 75 municipalities of Sergipe, the 2022 Census population of
Rio Grande do Norte, and the 2021 GDP of Sergipe.

## The panel

```bash
python -m observatorio exportar     # writes painel/dados/snapshot.json
cd painel && npm install && npm run build
```

Next.js 15 + React 19 + TypeScript, **fully static** (`output: "export"`) — no
server, no serverless function, no runtime data fetching. The build reads the
JSON snapshot from disk and emits HTML that already contains every number:
**2.1 kB per page, 104 kB of JS total.**

The one client component is the municipality table, because searching and
sorting 1,794 rows is the only thing here that genuinely needs JavaScript.

**No CSS framework**, by decision: design tokens as custom properties plus CSS
Modules. One less dependency, and real control over typography — including
`font-variant-numeric: tabular-nums`, without which number columns wobble and
comparing values becomes work.

**Accessibility is not decoration here**: skip link, real table semantics with
`<th scope>`, sortable headers as actual `<button>`s (focus and keyboard for
free), `aria-sort` only on the active column, and `prefers-reduced-motion`
honoured.

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
and against the live API (second run: 0 new, 1,794 already known).

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
three tender documents behind `ESPEC` price it at BRL 5,000–6,000 per month.

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
rather than promised. See `ESPEC.md` for the verification log.
