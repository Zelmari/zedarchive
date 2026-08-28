<div align="center">
  <img src="public/transparentlogo.png" alt="ZedArchive Logo" width="120" />

# ZedArchive

**A quiet, distraction-free media archive for your TV series, movies, anime, novels, and books.**

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square&logo=drizzle)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=flat-square&logo=postgresql)](https://supabase.com/)
[![Better Auth](https://img.shields.io/badge/Better--Auth-Framework-8B5CF6?style=flat-square)](https://better-auth.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## 📖 Overview

**ZedArchive** is an editorial, tactile personal media tracker designed for people who appreciate calm, intentional software. Built with physical paper and bookish aesthetics, it replaces noisy, social-heavy trackers with a private, edge-fast, and keyboard-first cataloging experience.

Whether you're bingeing a multi-season show, tracking feature films, following seasonal anime, reading multi-volume light novels, or pacing through classic literature, ZedArchive keeps your progress in sync without distractions.

---

## ✨ Current Capabilities

### 🔍 Spotlight Search-First Add Flow

- **Multi-Source Autofill:** Search TV series via **TVMaze**, Feature Films via **TMDB**, Anime & Manga via **AniList GraphQL**, and Books via **Google Books** and **OpenLibrary**.
- **Automated Structure & Metadata:** Automatically fetches season-by-season episode counts, movie runtimes, volume breakdowns, release years, genres, and compressed cover art.
- **Pre-Save Inspection:** Expand into a full detail form to customize starting progress, set initial status, assign 1–10 star ratings, and record initial review notes before saving.
- **Manual Entry Escape:** Press <kbd>Esc</kbd> anytime in the search window to switch directly to manual creation.

### 🎛️ Granular Progress Steppers

- **Season-Aware TV & Anime Steppers:** Dynamic season navigation where episode totals adapt automatically per season. Stepping past the final episode of a season advances to the next season.
- **Multi-Volume & Chapter Steppers:** Volume selector paired with direct chapter/page input fields for books and manga.
- **Movie Runtime & Rewatch Steppers:** Log movie viewings with minutes watched or 1-click completion and rewatch incrementing.
- **Auto-Completion Milestone:** Reaching maximum progress prompts an interactive completion confirmation.

### 🎨 Account-Synced Themes

Choose an aesthetic that matches your taste, stored in your database account so it syncs across your phone, tablet, and laptop:

- 📜 **Parchment (Default):** Warm linen paper, charcoal ink, and subtle slate borders.
- 🌑 **Midnight Slate:** Deep graphite and obsidian dark mode with crisp white text.
- 📖 **Vintage Sepia:** Warm amber, aged book paper, and terracotta highlights.
- ⬛ **E-Ink Monochrome:** High-contrast pure black and white mimicking physical e-readers.
- 📟 **Phosphor Cyber:** Retro terminal dark mode with glowing green CRT phosphor accents.

### 📖 Detailed View & Rewatch Tracker

- **Editorial Deep Dive:** Click any card's artwork or title to inspect the full synopsis, metadata, and personal notes.
- **Interactive Numbered Grid:** Quick-jump checklist to mark off individual episodes or chapters.
- **Rewatch / Reread Counter:** Start a rewatch/reread with one click to increment your counter and reset progress without losing previous completion history.

### 🏷️ Custom Shelves, Tags & Search Filtering

- Organize titles with custom tags like `#favorites`, `#cozy`, `#summer-2026`, or `#must-read`.
- Filter your dashboard collection by status pills (_In Progress_, _Completed_, _Planning_, _On Hold_, _Dropped_) or custom shelf tags in the toolbar.
- Sort by _Recently Updated_, _Date Added (Newest/Oldest)_, _Title (A–Z / Z–A)_, _Progress %_, or _Highest Rated_.

### 📅 Next Airdate Radar

- **Live Broadcast Tracking:** In-progress TV series and seasonal anime automatically query upcoming episode release dates via **TVMaze** and **AnimeSchedule**.
- **Countdown Badges:** Displays next episode numbers and formatted broadcast dates directly on cards.

### 📊 Collection Statistics & Annual Wrapped

- **Archive Statistics Modal:** Comprehensive breakdown of completion rates, total episodes watched, chapters read, movie minutes logged, and score averages.
- **Yearly Wrapped (`/wrapped` & `/u/[username]/wrapped/[year]`):** Editorial year-in-review zine featuring month-by-month completion bar charts, category distribution, favorite focus genres, and top-rated masterworks.

### 🌐 Public Profiles & Ephemeral Guestbook

- **Shareable Profiles (`/u/[username]`):** Showcase your curated library, stats, and Wrapped report with friends. Toggle between _Public_ and _Private_ at any time.
- **Discover Public Archives (`/search`):** Search community members by username or display name.
- **Ephemeral Guestbook:** Leave comments on public profiles with an automatic **7-day expiration (TTL)** to keep guestbooks clean, spontaneous, and ephemeral.
- **Reciprocity Gated:** Only members with public profiles can leave guestbook comments.

### 💾 Data Sovereignty (Backup & Import)

- **1-Click Export:** Download your entire library anytime as standard **JSON** or spreadsheet-ready **CSV**.
- **Multi-Platform Importer:** Seamlessly import backups from **ZedArchive JSON**, **AniList JSON**, **Simkl JSON**, **Goodreads CSV**, **Letterboxd CSV**, and **MyAnimeList XML** (with automatic `.gz` decompression and conflict resolution).

### 🔒 Privacy & Account Security

- **Better Auth Framework:** Secure authentication with scrypt password hashing, session management, and HTTP-only cookies.
- **Email Verification & Password Recovery:** Integrated with Resend / SMTP for account verification and password resets.
- **Atomic Account Deletion:** Self-service atomic database wipe across all related tables in Settings.

---

## 🗺️ Things to Come (Feature Plans & Roadmap)

Intricate architectural implementation plans for upcoming capabilities are detailed in the [`plans/`](plans/) directory:

1. [**DNF / Dropped Reason & Progress Retention**](plans/01-drop-reason-and-retention.md) — Document drop reasons and milestones without skewing library completion rates.
2. [**Multiple Start & Finish Dates**](plans/02-multiple-start-finish-dates.md) — Full rewatch/reread timeline history with multiple start/end timestamps, cycle ratings, and cycle notes.
3. [**Priority Queue & "Up Next" Shelf**](plans/03-priority-queue.md) — Dedicated queue rank ordering, up-next carousel, and priority sort mode.
4. [**Where to Watch & Streaming Availability Badges**](plans/04-where-to-watch-streaming-availability.md) — Country-aware streaming provider badges (Netflix, Criterion, Crunchyroll, MUBI) powered by TMDB & JustWatch.
5. [**Page Number vs. Percentage Toggle & Converter**](plans/05-page-number-percentage-toggle.md) — Instant bidirectional conversion between raw book page counts and e-reader percentage progress.
6. [**Reading Goals & Challenge Tracker**](plans/06-target-book-count-goals.md) — Annual and monthly target book counters with real-time pacing forecasts.
7. [**Anime Filler vs. Canon Episode Guide**](plans/07-anime-filler-canon-guide.md) — Unified filler and canon episode indicators powered by Jikan v4 / MAL.
8. [**Weekly Airing Calendar**](plans/08-weekly-release-calendar.md) — 7-day schedule grid of currently airing shows and anime in your archive with 1-click logging.
9. [**Markdown & Rich Text Notes Support**](plans/09-markdown-notes-support.md) — CommonMark formatting (bold, italics, blockquotes, lists) and live Write/Preview editing for reviews.
10. [**Favorite Quotes Repository per Title**](plans/10-favorite-quotes-repository.md) — Structured quotes collection per media entry with character attributions, citations, and 1-click clipboard formatting.
11. [**Universal Spoiler Tags**](plans/11-spoiler-tags.md) — Tap-to-reveal blurred ink spoiler protection (`||spoiler||` and `>!spoiler!<`) across notes and guestbook comments.
12. [**GitHub-Style Activity Contribution Heatmap**](plans/12-github-style-activity-heatmap.md) — 365-day 52-week activity contribution grid for public profiles and activity modals.
13. [**Custom Theme Palette Builder**](plans/13-custom-theme-palette-builder.md) — In-app visual color picker with WCAG contrast validation and account-synced custom themes.

---

## 🛠️ Tech Stack & Architecture

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React Server Components & Server Actions)
- **Edge Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/) powered by [OpenNext](https://opennext.js.org/cloudflare)
- **Database & ORM:** [PostgreSQL](https://www.postgresql.org/) (hosted on [Supabase](https://supabase.com/) or local Docker Postgres) with [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication:** [Better Auth](https://better-auth.com/) with scrypt password hashing and HTTP-only session cookies
- **Styling:** Design token bridge (`--za-*`) exposed to Tailwind CSS v4 with custom semantic themes
- **Icons:** [Lucide Icons](https://lucide.dev/)

### Runtime Requirements

- **Node.js ≥ 22** (enforced via `engines`, `.nvmrc`, and Cloudflare's `NODE_VERSION` build variable)

### Environment Contract

| Variable                      | Scope                      | Example                                                         |
| ----------------------------- | -------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                | Runtime secret             | `postgres://…@host:6543/postgres`                               |
| `BETTER_AUTH_SECRET`          | Runtime secret             | 32+ char random string                                          |
| `BETTER_AUTH_URL`             | Runtime + build            | `https://zedarchive.com` (must match canonical browsing origin) |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Runtime (optional)         | `https://zedarchive.com,https://preview.zedarchive.com`         |
| `NEXT_PUBLIC_APP_URL`         | Build (+ runtime harmless) | `https://zedarchive.com`                                        |
| `TMDB_API_READ_TOKEN`         | Runtime secret (optional)  | `eyJhbGciOi...` (TMDB v4 Bearer Token)                          |
| `TMDB_API_KEY`                | Runtime secret (optional)  | `32_char_hex_key` (TMDB v3 API Key fallback)                    |
| `RESEND_API_KEY`              | Runtime secret (optional)  | `re_123456789...`                                               |
| `EMAIL_FROM`                  | Runtime (optional)         | `ZedArchive <noreply@zedarchive.com>`                           |

---

## 🚀 Local Quickstart (Docker)

Run the full stack against a disposable local Postgres with one command:

```bash
cp .env.example .env.local   # Configure DATABASE_URL to local docker URL
npm run setup                # postgres up → migrate → seed demo data → next dev
```

- **Demo Credentials:** `demo@zedarchive.com` / `password123` (public handle `@zelmari`)
- **Stop Database:** `npm run docker:down`
- **Re-seed Data:** `npm run db:seed`

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
