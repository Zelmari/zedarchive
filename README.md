# ZedArchive

A quiet, self-hosted archive for the shows, films, books, anime, and manga you mean to keep.

## Features

- **Archive dashboard** — Total / Shows / Movies / Books tabs; search, status filters, eight sort orders, and a saved row-or-poster layout.
- **Progress tracking** — season/episode, volume/chapter, and page/runtime steppers, an Up Next queue, and per-category reading goals.
- **Media detail modal** — status, rating, progress, markdown notes, tags, quotes, rewatch/reread cycles, privacy toggle, season structures, filler guide, and streaming providers.
- **Metadata search** — TVMaze (shows), TMDB (movies, optional token), AniList (anime/manga), and OpenLibrary + Google Books (books).
- **Activity & stats** — timeline, 52-week heatmap, streak, and a weekly airdate calendar (`/api/shows/airdate`).
- **Public profiles** — `/u/[username]` catalog, stats, heatmap, and guestbook (7-day TTL, rate-limited).
- **Feeds** — RSS 2.0 and Atom 1.0 at `/u/[username]/rss.xml` and `/u/[username]/atom.xml`.
- **Backup & import** — export JSON/CSV; import ZedArchive, AniList, Simkl, Goodreads, Letterboxd, and MAL (`.xml.gz`).
- **Themes** — five presets plus a custom palette studio with WCAG contrast checks.
- **Navigation** — command palette (`Cmd/Ctrl + K`), spotlight search, and public user search at `/search`.
- **Accounts** — Better Auth email/password with verification and password reset; Resend optional.

## Tech stack

- **Framework & UI:** Next.js 16 (App Router, RSC), React 19, Tailwind CSS v4
- **Data & auth:** PostgreSQL + Drizzle ORM; Better Auth
- **Hosting:** Cloudflare Workers via `@opennextjs/cloudflare`
- **Tooling:** TypeScript, Zod, sharp, Resend (optional)
- **Metadata:** TVMaze, TMDB, AniList, Jikan (MAL), OpenLibrary, Google Books
- **Testing:** Vitest, Playwright

## Architecture

```
Browser (React 19 / Tailwind v4)
   │ HTTPS
   ▼
Cloudflare Worker — Next.js 16 via OpenNext
   ├── Server Components, Server Actions, route handlers
   │   (/api/search/*, /api/shows/airdate, /api/media/providers,
   │    /api/anime/filler, /api/assets/upload)
   └── Public profiles and RSS/Atom feeds
   │ Drizzle ORM
   ▼
PostgreSQL — user · session · account · verification
             media_entries · media_activity_logs · profile_comments
```

## Quickstart

Prerequisites: Node.js ≥ 22, npm ≥ 10, Docker.

```bash
git clone https://github.com/Zelmari/zedarchive.git
cd zedarchive
npm install
cp .env.example .env.local   # set DATABASE_URL and BETTER_AUTH_SECRET
npm run docker:up
npm run db:sync
npm run db:seed
npm run dev                  # http://localhost:3000
```

`npm run setup` runs `docker:up`, `db:sync`, `db:seed`, and `dev` together.

Demo login: `demo@zedarchive.com` / `password123` (from `src/db/seed.ts`, overridable with `DEMO_EMAIL` / `DEMO_PASSWORD`); public handle `@zelmari`.

## Environment variables

Local development uses `.env.local`; local Worker previews use `.dev.vars`.

| Variable                      | Required | Description                                                     |
| ----------------------------- | :------: | --------------------------------------------------------------- |
| `DATABASE_URL`                |   Yes    | PostgreSQL connection string                                    |
| `BETTER_AUTH_SECRET`          |   Yes    | 32+ character session-signing secret                            |
| `BETTER_AUTH_URL`             |   Yes    | Canonical app URL (default `http://localhost:3000`)             |
| `NEXT_PUBLIC_APP_URL`         |   Yes    | Public app URL; falls back to `BETTER_AUTH_URL`                 |
| `BETTER_AUTH_TRUSTED_ORIGINS` |    No    | Comma-separated extra origins trusted by Better Auth            |
| `RESEND_API_KEY`              |    No    | Email for verification and password reset; optional             |
| `EMAIL_FROM`                  |    No    | Sender identity (default `ZedArchive <noreply@zedarchive.com>`) |
| `TMDB_API_READ_TOKEN`         |    No    | TMDB v4 token for movie search and watch providers              |
| `TMDB_API_KEY`                |    No    | Legacy TMDB v3 key, used when the read token is unset           |
| `E2E_PORT`                    |    No    | Playwright dev-server port (default `8787`)                     |
| `E2E_BASE_URL`                |    No    | Playwright base URL; when set, no dev server is started         |
| `PW_EXECUTABLE`               |    No    | Path to a system Chromium binary for Playwright                 |

## Scripts

| Command                                                  | Description                                     |
| -------------------------------------------------------- | ----------------------------------------------- |
| `npm run dev` · `build` · `start`                        | Dev server, production build, serve build       |
| `npm run lint` · `typecheck`                             | ESLint; Next type generation + `tsc --noEmit`   |
| `npm test` · `test:e2e`                                  | Vitest unit + integration; Playwright Chromium  |
| `npm run db:generate` · `db:migrate` · `db:sync`         | Generate, apply, or generate + apply migrations |
| `npm run db:push` · `db:seed`                            | Push schema directly; seed the demo archive     |
| `npm run docker:up` · `docker:down`                      | Start / stop local PostgreSQL                   |
| `npm run setup`                                          | `docker:up` + `db:sync` + `db:seed` + `dev`     |
| `npm run build:worker` · `preview` · `deploy` · `upload` | Build the Worker; preview, deploy, or upload    |

## Project structure

```
src/
├── app/          App Router routes: (auth), dashboard, settings, search, u/[username], api/*
├── components/   cards, dashboard, modals, navigation, search, theme, ui
├── db/           Drizzle schema and seed
├── domain/       Media sanitizers, priority queue, activity helpers
├── hooks/        Card layout, filters, modal manager, focus trap
├── lib/          Auth, backup importers, metadata services, themes, stats
├── server/       Queries and server-side data access
└── types/        Shared TypeScript types
drizzle/          SQL migrations
e2e/              Playwright specs
tests/            Vitest unit + integration
docker-compose.yml · wrangler.jsonc · open-next.config.ts
```

## Testing

- `npm test` — Vitest unit and integration suites in `tests/`; no live database required.
- `npm run test:e2e` — Playwright Chromium suite in `e2e/`; starts `next dev` on port 8787 unless `E2E_BASE_URL` is set, and expects a migrated `DATABASE_URL`.
- CI runs lint, typecheck, tests, build, and e2e against PostgreSQL (`.github/workflows/ci.yml`).

## Deployment

ZedArchive deploys as a Cloudflare Worker via OpenNext.

1. `npm run build:worker` builds `.open-next/worker.js`.
2. Configure `wrangler.jsonc` (name, compatibility flags, `ASSETS` / `IMAGES` / `WORKER_SELF_REFERENCE` bindings).
3. Set production secrets with `wrangler secret put` or the Cloudflare dashboard: `DATABASE_URL`, `BETTER_AUTH_SECRET`, optionally `RESEND_API_KEY` / `TMDB_API_READ_TOKEN`; `EMAIL_FROM` is a plain var in `wrangler.jsonc`.
4. Run `npm run db:migrate` against the production database.
5. `npm run deploy` publishes the Worker (`npm run upload` publishes without promoting).

For a local Worker preview, copy `.dev.vars.example` to `.dev.vars`, fill it in, and run `npm run preview`.

## License

MIT — see [LICENSE](LICENSE).
