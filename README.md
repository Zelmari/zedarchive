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

## ✨ Core Capabilities

### ⚡ Global Command Palette (`Cmd + K` / `Ctrl + K`)

- **Instant Title Spotlight:** Search across your entire catalog with fuzzy matching from anywhere on the dashboard.
- **Keyboard Navigation:** Jump to Settings, View Stats, Change Themes, Open Weekly Calendar, or Manage Anthologies with zero mouse clicks.
- **Quick Logging:** Rapidly open and update progress on any title directly from the search palette.

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

### 📚 Curated Stacks & Anthologies

- **Thematic Editorial Collections (`/stacks`):** Group titles into custom collections (e.g. _"Spooky Autumn Reads"_, _"90s Cyberpunk Essentials"_, or _"Cozy Rainy Day Shows"_).
- **Personal Annotations:** Write intro essays and per-title notes explaining why each item belongs in the anthology.
- **Public Showcase Pages (`/u/[username]/stacks/[slug]`):** Share curated editorial stacks as standalone, beautifully formatted reading lists.

### 🤝 Taste Match & Archive Comparison

- **Non-Algorithmic Comparison (`/u/[username]/compare/[targetUser]`):** Compare your public archive side-by-side with any friend's archive.
- **Taste Overlap Analytics:** Computes shared catalog percentage, rating agreement correlation, top shared genres, and your **Shared Masterworks** (titles you both rated 9–10★).

### 📰 RSS 2.0 & Atom 1.0 Public Feeds

- **Open Web Syndication:** Friends can subscribe to your public media archive in their favorite feed reader via standard endpoints:
  - `/u/[username]/rss.xml` (RSS 2.0)
  - `/u/[username]/atom.xml` (Atom 1.0)
- **Privacy Guaranteed:** Private titles and private profiles are strictly excluded from feed generation.

### 📴 True Offline-First Architecture & Outbox

- **IndexedDB Mutation Outbox:** All progress steppers, notes, and ratings queue safely on your device when your connection drops.
- **Automatic Background Sync:** Pending writes replay seamlessly in order the moment your internet reconnects.
- **Live Sync Indicator:** Header pill badge indicates real-time sync state (🟢 In Sync, 🟡 Queued Offline Writes, 🔴 Offline).

### 🛡️ Granular Per-Title Privacy Controls

- **Private Title Toggle:** Mark individual titles as **Private** directly in the Add/Edit form.
- **Locked Dashboard Badge:** Private titles display a subtle lock icon on your dashboard for easy visual distinction.
- **Leak Protection:** Private entries are 100% excluded from public profile pages (`/u/[username]`), yearly Wrapped reports, activity heatmaps, and public RSS feeds.

### 🎨 Themes & Custom Color Studio

Choose from 5 curated aesthetic themes or design your own bespoke color palette with the built-in studio:

- 📜 **Parchment (Default):** Warm linen paper, charcoal ink, and subtle slate borders.
- 🌑 **Midnight Slate:** Deep graphite and obsidian dark mode with crisp white text.
- 📖 **Vintage Sepia:** Warm amber, aged book paper, and terracotta highlights.
- ⬛ **E-Ink Monochrome:** High-contrast pure black and white mimicking physical e-readers.
- 📟 **Phosphor Cyber:** Retro terminal dark mode with glowing green CRT phosphor accents.
- 🎨 **Custom Color Studio:** Build and preview custom palettes (_Nordic Sage_, _Rosewater Linen_, _Solarized Sand_, _Dracula Obsidian_, or your own) with real-time **WCAG 2.1 Contrast Validation** (`AAA`/`AA`).

### 📖 Detailed View, Rewatches & Quotes Repository

- **Editorial Deep Dive:** Click any card's artwork or title to inspect the full synopsis, metadata, and formatted notes.
- **Interactive Numbered Grid:** Quick-jump checklist to mark off individual episodes or chapters.
- **Rewatch / Reread Cycles:** Full multi-cycle logging with multiple start/end dates, cycle ratings, and cycle-specific notes.
- **Favorite Quotes Repository:** Collect memorable lines per title with speaker attribution, chapter/timecode citation, and 1-click clipboard sharing (`“Quote” — Speaker, Title (Citation)`).
- **Markdown & Universal Spoilers:** Safe CommonMark formatting for notes (bold, italic, blockquotes, lists) and click-to-reveal spoiler blackout protection (`||spoiler||` and `>!spoiler!<`).

### 🏷️ Custom Shelves, Tags & Search Filtering

- Organize titles with custom tags like `#favorites`, `#cozy`, `#summer-2026`, or `#must-read`.
- Filter your dashboard collection by status pills (_In Progress_, _Completed_, _Planning_, _On Hold_, _Dropped_) or custom shelf tags.
- Sort by _Recently Updated_, _Date Added (Newest/Oldest)_, _Title (A–Z / Z–A)_, _Progress %_, or _Highest Rated_.
- **DNF / Drop Reason Tracking:** Record detailed drop reasons and milestone progress without skewing completed library statistics.

### 🎬 Streaming Availability & Anime Filler Guide

- **Where to Watch:** Country-aware streaming provider badges (Netflix, Max, Crunchyroll, Disney+, Prime Video, Criterion) powered by **TMDB & JustWatch**.
- **Anime Filler vs. Canon Guide:** Visual episode badges (_Manga Canon_, _Anime Canon_, _Filler_) and breakdown timeline powered by **Jikan v4 / MAL**.

### 📅 Next Airdate Radar & Weekly Calendar

- **Live Broadcast Tracking:** In-progress TV series and seasonal anime automatically query upcoming release dates via **TVMaze**.
- **Weekly Airing Calendar:** 7-day schedule drawer of currently airing shows and anime in your archive with 1-click episode logging.

### 📊 Reading Goals, Activity Heatmap & Annual Wrapped

- **GitHub-Style Contribution Heatmap:** 52-week × 7-day visual activity grid tracking daily watch/read logging momentum.
- **Reading Challenges & Goals:** Annual and monthly target book counters with real-time pacing forecasts (_"2 ahead of schedule"_).
- **Archive Statistics Modal:** Comprehensive breakdown of completion rates, total episodes watched, chapters read, movie minutes logged, and score averages.
- **Yearly Wrapped (`/wrapped` & `/u/[username]/wrapped/[year]`):** Editorial year-in-review zine featuring month-by-month completion bar charts, category distribution, and top-rated masterworks.

### 🌐 Public Profiles & Ephemeral Guestbook

- **Shareable Profiles (`/u/[username]`):** Showcase your curated library, activity heatmap, reading challenges, and Wrapped report with friends.
- **Discover Public Archives (`/search`):** Search community members by username handle or display name.
- **Ephemeral Guestbook:** Leave notes on public profiles with automatic **7-day expiration (TTL)** and built-in spoiler tags.

### 💾 Data Sovereignty (Backup & Multi-Platform Importer)

- **1-Click Export:** Download your entire library anytime as standard **JSON**, **Markdown**, or spreadsheet-ready **CSV**.
- **Multi-Platform Importer:** Seamlessly import backups from **ZedArchive JSON**, **AniList JSON**, **Simkl JSON**, **Goodreads CSV**, **Letterboxd CSV**, and **MyAnimeList XML** (with automatic `.gz` decompression and conflict resolution).

### 🔒 Privacy & Account Security

- **Better Auth Framework:** Secure authentication with scrypt password hashing, session management, and HTTP-only cookies.
- **Email Verification & Password Recovery:** Integrated with Resend / SMTP for account verification and password resets.
- **Atomic Account Deletion:** Self-service atomic database wipe across all related tables in Settings.

---

## 🛠️ Tech Stack & Architecture

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React Server Components & Server Actions)
- **Edge Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/) powered by [OpenNext](https://opennext.js.org/cloudflare)
- **Database & ORM:** [PostgreSQL](https://www.postgresql.org/) (hosted on [Supabase](https://supabase.com/) or local Docker Postgres) with [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication:** [Better Auth](https://better-auth.com/) with scrypt password hashing and HTTP-only session cookies
- **Client Offline Storage:** IndexedDB with localStorage fallback
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
