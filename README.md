# Archive

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
use separate PostgreSQL databases named `archive_dev` and `archive_test`.

Apply the committed migrations to `archive_dev` before loading catalogue data:

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
`archive_dev`. It is never run automatically by development startup, tests,
builds, migrations, or production deployment. Repeating the command is safe:
unchanged seed-owned records are not rewritten, and unrelated catalogue records
are left alone.

## License

z-archive's original source code and supporting documentation are available
under the [MIT License](LICENSE). Copyright (c) 2026 Zelmari.

Catalogue data can have separate terms. Records sourced from Wikidata use its
CC0 structured data and retain their Wikidata item identifiers as provenance.
See [data licensing and provenance](data/README.md) for the current boundary.
Dependencies and any future third-party assets retain their own licences.
