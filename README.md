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

## License

zedarchive's original source code and supporting documentation are available
under the [MIT License](LICENSE). Copyright (c) 2026 Zelmari.

Catalogue data can have separate terms. Records sourced from Wikidata use its
CC0 structured data and retain their Wikidata item identifiers as provenance.
See [data licensing and provenance](data/README.md) for the current boundary.
Dependencies and any future third-party assets retain their own licences.
