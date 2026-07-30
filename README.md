# zedarchive

A Next.js, React, and TypeScript application for tracking things you watch and read.

## Development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Local database and catalogue

Create a local `.env` from `.env.example`, keep its credentials private, and
use separate PostgreSQL databases named `zedarchive_dev` and `zedarchive_test`.

Apply the committed migrations to `zedarchive_dev` before loading catalogue data:

```bash
npm run db:migrate
```

The development catalogue is a committed, deterministic set of representative
anime. Validate it without connecting to PostgreSQL:

```bash
npm run db:seed:check
```

Load it deliberately after migrations have completed:

```bash
npm run db:seed
```

The write command verifies that its live database is named exactly
`zedarchive_dev`. It is never run automatically by development startup, tests,
builds, migrations, or production deployment. Repeating the command is safe:
unchanged seed-owned records are not rewritten, and unrelated catalogue records
are left alone.

### Controlled Wikidata preparation

Validate the committed candidate manifest and reduced provider fixtures without
PostgreSQL or network access:

```bash
npm run catalogue:import:wikidata:check
```

Preparing a live review artifact is a separate, deliberate maintenance action:

```bash
npm run catalogue:import:wikidata -- prepare
```

Preparation requires the live database name `zedarchive_dev`, reads it only for
duplicate comparison, closes the database before contacting Wikidata, and
writes an ignored strict JSON artifact plus a compact Markdown review under
`.local/imports/`. Review the Markdown view for titles, aliases, metadata,
warnings, and classifications; the adjacent JSON remains the machine-readable
evidence. The importer never writes catalogue tables and has no apply mode.
Approved records are added to the committed deterministic seed through human
review and then loaded only with the existing guarded `npm run db:seed` command.

### Release anime catalogue

The reviewed version-1 release catalogue is a separate public, normalized
dataset:

- `data/releases/anime-catalogue.v1.json` contains the 500 application-owned
  catalogue records;
- `data/releases/anime-catalogue.v1.index.json` binds the corpus, manifests,
  review ledger, coverage, and deterministic hashes;
- `data/releases/anime-catalogue.v1.review.json` retains the approved,
  public-safe review evidence; and
- `data/imports/releases/anime-v1/` contains the twenty ordered 25-item
  Wikidata manifests.

These tracked files contain reviewed Wikidata CC0 facts and zedarchive-owned
normalization and curation. Raw provider responses, generated working reviews,
and private curation notes remain ignored and are not release data.

The release workflow has four deliberate modes:

```bash
npm run catalogue:release:check
npm run catalogue:release:plan
npm run catalogue:release:rehearse
npm run catalogue:release:apply
```

`check` validates committed files without a database, `plan` compares them
read-only with an explicitly allowed database, and `rehearse` atomically loads
only the exact disposable local rehearsal database.

`apply` is implemented as a guarded production-capable path but remains
disabled until Milestone 47 supplies and approves the production target,
enablement flag, release identity, and exact committed hash. Do not run it
during ordinary development. Catalogue mistakes are repaired with a reviewed
forward release; unsafe or disputed records move to `hidden`. Ordinary
catalogue correction never deletes records that user archives may reference.

## License

zedarchive's original source code and supporting documentation are available
under the [MIT License](LICENSE). Copyright (c) 2026 Zelmari.

Catalogue data can have separate terms. Records sourced from Wikidata use its
CC0 structured data and retain their Wikidata item identifiers as provenance.
See [data licensing and provenance](data/README.md) for the current boundary.
Dependencies and any future third-party assets retain their own licences.
