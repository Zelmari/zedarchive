<div align="center">
  <img src="public/transparentlogo.png" alt="ZedArchive Logo" width="108" />

# ZedArchive

**A quiet, tactile, edge-native media archive and reading companion for discerning collectors.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16.3.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.2.8-blue?style=flat-square&logo=react)](https://react.dev/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM_0.45.2-C5F74F?style=flat-square&logo=drizzle)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=flat-square&logo=postgresql)](https://supabase.com/)
[![Better Auth](https://img.shields.io/badge/Better--Auth-1.7.1-8B5CF6?style=flat-square)](https://better-auth.com/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-CSS_v4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tests-Vitest_%2B_Playwright-6E9F18?style=flat-square&logo=vitest)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## 📖 Executive Summary

**ZedArchive** is an editorial, distraction-free personal media tracker engineered for people who value calm, intentional software over algorithmic feeds and notification noise. Inspired by physical bookplates, linen book cloth, and tactile editorial design, it combines the aesthetic warmth of a private library with modern edge-first systems architecture.

Designed from the ground up for zero-latency tracking across **television series**, **feature films**, **seasonal anime**, **manga**, **light novels**, and **literature**, ZedArchive solves common pain points found in legacy media trackers: bloated user interfaces, forced social feeds, vendor lock-in, unreliable offline capability, and sluggish multi-region database latency.

### Key Capabilities at a Glance

- **Global Command Palette (`Cmd + K` / `Ctrl + K`):** Instant fuzzy-search spotlight across your catalog, modal navigation, and keyboard-driven logging.
- **Federated Metadata Autofill:** Real-time search across TVMaze, TMDB, AniList GraphQL, Google Books, and OpenLibrary with automatic season structures and runtime calculations.
- **Offline-First Outbox Synchronization:** Full client-side IndexedDB mutation queue with exponential backoff, dead-letter retry safety, and service worker caching.
- **Thematic Anthologies & Curated Stacks (`/stacks`):** Editorial collections with per-title essays and standalone public showcase URLs (`/u/[username]/stacks/[slug]`).
- **Non-Algorithmic Taste Match Engine (`/u/[username]/compare/[targetUser]`):** Direct catalog overlap computation, rating correlation agreement, and shared masterwork detection.
- **Open Web Syndication:** Automatic RSS 2.0 (`/u/[username]/rss.xml`) and Atom 1.0 (`/u/[username]/atom.xml`) feeds with strict privacy leak guarantees.
- **Custom Color Studio & WCAG 2.1 Validator:** 5 pre-built aesthetic themes plus a live palette editor with mathematical relative luminance contrast verification (`AAA`/`AA`).
- **Data Sovereignty & Universal Importer:** Full JSON/CSV/Markdown library exports alongside a multi-format importer supporting ZedArchive, AniList, Simkl, Goodreads, Letterboxd, and MyAnimeList (`.xml.gz` streaming decompression).

---

## 🏗️ System Architecture & Edge Topology

ZedArchive is deployed as a globally distributed, edge-rendered application leveraging Next.js 16 Server Components on Cloudflare Workers, paired with a pooled PostgreSQL database and a client-side IndexedDB persistence engine.

```mermaid
flowchart TD
    subgraph Client["Client Tier (User Device & PWA)"]
        Browser["React 19 Client UI (Tailwind v4 Token Bridge)"]
        Outbox[("IndexedDB Mutation Outbox (za_offline_db)")]
        SW["Service Worker (Cache-First Assets / Network-First Shell)"]
        CanvasEngine["Canvas Image Compression (WebP / Max-Clamped)"]
    end

    subgraph Edge["Edge Compute Tier (Cloudflare Workers via OpenNext)"]
        WorkerRoute["workerd V8 Isolate (Global CDN Anycast)"]
        RSC["React Server Components (SSR & Layout Pipeline)"]
        ServerActions["Server Actions (Data Mutation Layer)"]
        APIRoutes["Route Handlers (REST & RSS/Atom XML Syndication)"]
        AssetBinding["Cloudflare ASSETS & IMAGES CDN Bindings"]
    end

    subgraph Driver["Edge Database Layer (Resilience Proxy)"]
        SocketProxy["createRetryingPostgresClient Proxy (workerd Stale Socket Retrier)"]
        Drizzle["Drizzle ORM (Type-Safe Query Builder)"]
    end

    subgraph Database["Database Tier (PostgreSQL / Supabase)"]
        PG[("PostgreSQL 15+ Instance")]
        SchemaHybrid["Hybrid Relational Schema (Normalized Entities + Fast JSONB)"]
    end

    subgraph External["External APIs (On-Demand Metadata & Delivery)"]
        TVMaze["TVMaze API (Series Structure & Airdate Radar)"]
        TMDB["TMDB API (Movies & JustWatch Stream Providers)"]
        AniList["AniList GraphQL (Anime & Manga Search)"]
        Jikan["Jikan v4 / MAL (Anime Filler / Canon Guides)"]
        OpenLib["OpenLibrary & Google Books (Volume Counts & ISBN)"]
        Resend["Resend API (Transactional Auth Emails)"]
    end

    Browser <--> Outbox
    Browser <--> SW
    Browser --> CanvasEngine
    Browser <-->|HTTPS / HTTP2 / TLS 1.3| WorkerRoute

    WorkerRoute --> RSC
    WorkerRoute --> ServerActions
    WorkerRoute --> APIRoutes
    WorkerRoute --> AssetBinding

    ServerActions <--> SocketProxy
    APIRoutes <--> SocketProxy
    SocketProxy --> Drizzle
    Drizzle <-->|Direct TLS Connection Pool| PG

    ServerActions -->|On-Demand Query| TVMaze
    ServerActions -->|On-Demand Query| TMDB
    ServerActions -->|GraphQL Query| AniList
    ServerActions -->|On-Demand Query| Jikan
    ServerActions -->|On-Demand Query| OpenLib
    ServerActions -->|Transactional Email| Resend
```

### Hosting & Infrastructure Breakdown

| Component                   | Responsibility                                                                         | Technology / Host                                     | Key Technical Characteristics                                                                   |
| :-------------------------- | :------------------------------------------------------------------------------------- | :---------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| **Edge Compute Runtime**    | Next.js 16 App Router, RSC, Server Actions, Route Handlers                             | **Cloudflare Workers** (via `@opennextjs/cloudflare`) | Zero cold starts, execution within V8 isolates across 300+ edge locations worldwide.            |
| **Relational Database**     | User accounts, credentials, media entries, tags, cycles, quotes, anthologies, comments | **PostgreSQL (Supabase / Self-Hosted Docker)**        | Drizzle ORM query builder, pooled TCP connections, atomic cascade wipe constraints.             |
| **Offline Engine & Outbox** | Queued mutations, progress updates, review drafts, offline UI shell                    | **IndexedDB (`za_offline_db`) + Service Worker**      | Optimistic UI updates with rollback, exponential backoff sync, and dead-letter safety.          |
| **Static Assets & Media**   | CSS, JS bundles, branding icons, UI fonts, compressed covers                           | **Cloudflare Workers Asset Binding (`ASSETS`)**       | Global cache-control headers (`s-maxage`, `immutable`) with stale-while-revalidate.             |
| **Metadata Aggregation**    | Multi-media title search, season structures, streaming badges, filler guides           | **Federated External APIs + Postgres Cache**          | On-demand search with Postgres TTL cache (`external_api_cache`) to prevent API rate exhaustion. |
| **Transactional Email**     | Password resets, email verification links                                              | **Resend REST API**                                   | Signed HMAC tokens, anti-enumeration security timing, and 1-hour expiration windows.            |

---

## 🔬 Deep-Dive Engineering Highlights

### 1. Cloudflare Workers `workerd` Stale TCP Socket Retry Proxy

**The Challenge:** In Cloudflare Workers (`workerd`), TCP socket connections established in one incoming request context cannot be shared or reused across subsequent asynchronous requests. When a persistent PostgreSQL connection pool retains an open socket handle from a prior request, subsequent database queries trigger a fatal runtime error:
`Cannot perform I/O on behalf of a different request`.

**The Solution:** Rather than disabling connection pooling or falling back to high-latency HTTP transaction proxies, ZedArchive implements a transparent Proxy wrapper around the underlying `postgres.js` client (`src/lib/db.ts`):

```typescript
// Architectural extract from src/lib/db.ts
export function createRetryingPostgresClient(connectionString: string, options: Options = {}) {
  let client = postgres(connectionString, { ...options, max: 1 });

  return new Proxy(client, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== 'function') return orig;

      return async function (...args: any[]) {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          try {
            return await orig.apply(client, args);
          } catch (err: any) {
            const isDifferentRequestError =
              err?.message?.includes('different request') ||
              err?.cause?.message?.includes('different request');

            if (isDifferentRequestError && attempts < maxAttempts - 1) {
              attempts++;
              try {
                await client.end({ timeout: 0.1 });
              } catch {}
              client = postgres(connectionString, { ...options, max: 1 });
              continue;
            }
            throw err;
          }
        }
      };
    },
  });
}
```

This proxy intercepts every query call at the driver boundary. If a `"different request"` socket isolation error occurs, the stale client is terminated, a clean edge socket connection is acquired, and the transaction is automatically retried without dropping the user's request.

---

### 2. Resilient Offline-First Outbox Synchronization

ZedArchive treats network connectivity as an enhancement rather than a hard dependency. Progress steppers, status updates, review notes, and ratings execute optimistically on the client device while synchronizing in the background.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Action (Step Episode)
    participant UI as React 19 State
    participant Outbox as IndexedDB (za_offline_db)
    participant Engine as Sync Engine (Web Worker / Loop)
    participant Server as Server Action (PostgreSQL)

    User->>UI: Increment Progress (Ep 5 -> Ep 6)
    UI->>UI: Optimistically update UI state & recalculate progress %
    UI->>Outbox: Append mutation to mutation_outbox (type: UPDATE_PROGRESS, payload)

    alt Online & Connected
        Engine->>Outbox: Poll oldest pending mutation
        Outbox-->>Engine: Return mutation item
        Engine->>Server: Execute updateMediaProgress(id, payload)
        Server-->>Engine: 200 OK (Updated Record)
        Engine->>Outbox: Delete mutation from outbox
        Engine->>UI: Dispatch window event 'za:sync-status' (in_sync)
    else Offline or Network Drop
        Engine->>Server: Network Request Fails (FetchError)
        Engine->>Outbox: Increment retryCount & compute exponential backoff delay
        Engine->>UI: Dispatch window event 'za:sync-status' (offline_queued)
        Note over Engine,Outbox: Retries up to 5 times. If permanently failed, moves to Dead-Letter Queue.
    end
```

- **Conflict Detection:** Client mutations store `baseUpdatedAt` timestamps to prevent stale offline updates from overwriting fresher server-side modifications.
- **Dead-Letter Queue:** If a mutation fails after 5 backoff attempts (e.g., due to schema validation failure), it is isolated to prevent outbox head-of-line blocking.
- **Reactive UI Events:** Custom `za:sync-status` window events drive the live sync badge in the top navigation bar.

---

### 3. Memory-Safe Client-Side Image Compression

Cover art and user avatars are compressed directly inside the browser using HTML5 Canvas (`src/lib/client/image-utils.ts`) before being uploaded or stored:

- **Dimension Clamping:** Avatars are clamped to 256×256 pixels; media covers are clamped to 400×600 pixels (standard 2:3 book/poster ratio).
- **Format Fallback:** Images are converted to WebP (`quality: 0.85`), falling back to JPEG if WebP encoding is unsupported by the browser.
- **Decompression Bomb Protection:** Strict guards verify image dimensions prior to rendering: images exceeding 4096×4096 px or raw files larger than 10MB are rejected immediately to prevent browser memory exhaustion.

---

### 4. Mathematical WCAG 2.1 Contrast Engine

The Custom Theme Studio does not rely on subjective color pickers. It computes relative luminance mathematically according to the official W3C WCAG 2.1 specification (`src/lib/color.ts`):

$$\text{Luminance } (L) = 0.2126 \cdot R_{\text{linear}} + 0.7152 \cdot G_{\text{linear}} + 0.0722 \cdot B_{\text{linear}}$$

Where each sRGB color component is linearized:

$$C_{\text{linear}} = \begin{cases} \frac{C_{\text{sRGB}}}{12.92} & \text{if } C_{\text{sRGB}} \le 0.04045 \\ \left(\frac{C_{\text{sRGB}} + 0.055}{1.055}\right)^{2.4} & \text{if } C_{\text{sRGB}} > 0.04045 \end{cases}$$

$$\text{Contrast Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05} \quad (\text{where } L_1 > L_2)$$

The studio verifies every custom color pair in real-time, displaying compliance badges:

- **AAA (Enhanced):** Ratio $\ge 7.0:1$ for normal text
- **AA (Standard):** Ratio $\ge 4.5:1$ for normal text
- **AA Large:** Ratio $\ge 3.0:1$ for headings ($>18\text{pt}$)
- **Fail:** Ratio $< 3.0:1$ (blocks theme saving to maintain readability)

---

### 5. Multi-Platform Importer with Streaming Gzip Decompression

The data migration engine (`src/lib/backup.ts`) parses backups from 6 different platforms without requiring third-party Node.js extraction libraries:

- **Native Web Streams:** Decompresses MyAnimeList `.xml.gz` archives in the browser using the Web Standard `DecompressionStream('gzip')`.
- **Supported Schemas:**
  1. **ZedArchive JSON:** Complete native backup including tags, cycles, quotes, and metadata.
  2. **AniList JSON:** Anime/Manga list export with format translation.
  3. **Simkl JSON:** TV, Anime, and Movie tracking records.
  4. **Goodreads CSV:** Book reading records, custom shelves, ISBNs, and ratings.
  5. **Letterboxd CSV:** Film diary, ratings, release years, and view dates.
  6. **MyAnimeList XML:** Standard MAL anime/manga export archives.

---

### 6. Relational Schema & Hybrid Normalization

ZedArchive employs a hybrid relational model in PostgreSQL via Drizzle ORM (`src/db/schema.ts`):

- **O(1) Single-Row Dashboard Reads:** Single-item details such as `structure` (season-by-season episode breakdowns), `cycles` (rewatch histories), `quotes`, and `tags` are stored as validated JSONB columns on `media_entries`. This enables ultra-fast dashboard queries without multi-table join overhead.
- **Relational Analytics & Deduplication:** When relational operations are needed (e.g. cross-user taste comparisons, shared tag analytics, editorial stacks), normalized tables (`media_cycles`, `media_quotes`, `media_tags`, `media_entry_tags`, `stack_items`, `friendships`, `groups`) maintain referential integrity with cascading deletes.

---

## 🎨 Design System & Theming Engine

ZedArchive features an editorial design system built on CSS design tokens (`--za-*`) bridged seamlessly into Tailwind CSS v4.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           THEME PALETTES                                │
├──────────────────┬──────────────────────────────────────────────────────┤
│ 📜 Parchment     │ Warm linen canvas (#f7f5f0), high-contrast obsidian  │
│ (Default)        │ ink (#242321), and tactile paper surfaces.           │
├──────────────────┼──────────────────────────────────────────────────────┤
│ 🌑 Midnight      │ Deep graphite canvas (#121316), obsidian cards, and  │
│                  │ crisp neutral-white typography.                      │
├──────────────────┼──────────────────────────────────────────────────────┤
│ 📖 Sepia         │ Aged parchment (#f4ebd9), warm terracotta ink, and   │
│                  │ classic literary binding tones.                      │
├──────────────────┼──────────────────────────────────────────────────────┤
│ ⬛ E-Ink         │ High-contrast monochrome (#ffffff / #000000) styled  │
│                  │ after physical electronic ink readers.               │
├──────────────────┼──────────────────────────────────────────────────────┤
│ 📟 Phosphor      │ Cyber-retro terminal (#090e09) with luminous green   │
│                  │ phosphor accents (#22c55e).                          │
├──────────────────┼──────────────────────────────────────────────────────┤
│ 🎨 Custom Studio │ User-authored hex palette with real-time WCAG 2.1    │
│                  │ mathematical contrast compliance scoring.            │
└──────────────────┴──────────────────────────────────────────────────────┘
```

---

## 🌟 Comprehensive Feature Catalog

### ⚡ Navigation & Catalog Management

- **Command Palette (`Cmd+K` / `Ctrl+K`):** Global fuzzy-search modal to jump to any title, switch themes, open stats, or launch the weekly schedule drawer.
- **Spotlight Search-First Add Flow:** Search TV shows (TVMaze), Movies (TMDB), Anime/Manga (AniList), and Books (Google Books/OpenLibrary) with automatic season structures and cover artwork.
- **Granular Progress Steppers:** Season-aware episode advancing, volume/chapter steppers, and movie minute logging with 1-click completion triggers.
- **DNF / Drop Reason Tracking:** Record specific drop reasons (e.g., _"Pacing fell off after season 2"_) and last-read milestones without skewing library completion metrics.
- **Multi-Cycle Rewatches & Rereads:** Track repeated viewings with individual start/completion dates, per-cycle ratings, and notes.
- **Favorite Quotes Repository:** Collect memorable dialogue and excerpts with speaker attribution, chapter/timecode citations, and 1-click formatted clipboard export.
- **Safe CommonMark & Spoilers:** Full markdown support in review notes with accessible click-to-reveal spoiler protection (`||spoiler||` and `>!spoiler!<`).

### 🤝 Social, Stacks & Taste Comparison

- **Curated Stacks & Anthologies (`/stacks`):** Assemble thematic reading lists (e.g., _"Hard Sci-Fi Masterworks"_ or _"Autumn Cozy Mystery"_) with intro essays and per-title annotations. Public stacks are viewable at `/u/[username]/stacks/[slug]`.
- **Taste Match Engine (`/u/[username]/compare/[targetUser]`):** Non-algorithmic comparison analyzing shared titles, genre correlations, rating similarity percentage, and **Shared Masterworks** (titles both users rated 9–10★).
- **Public Profile Showcases (`/u/[username]`):** Public portfolio with stats, reading goals, 52-week activity heatmap, and curated library entries.
- **Ephemeral Guestbook:** 7-day auto-expiring guestbook notes on public profiles with an anti-abuse reciprocity requirement (commenters must possess a public handle).
- **Collaborative Group Workspaces (`/groups`):** Shared group archives, member permission roles (Owner/Member), and 7-day ephemeral group chat.
- **Mutual Friendship System (`/friends`):** Direct friend discovery, incoming/outgoing request management, and friend-only group invitations.

### 📊 Analytics, Radar & Syndication

- **GitHub-Style Activity Heatmap:** 52-week × 7-day interactive grid tracking daily reading and viewing activity.
- **Reading Goal Tracker:** Yearly reading targets with automatic pacing forecasting (_"2 books ahead of schedule"_ vs. _"behind pace"_).
- **Annual Wrapped (`/wrapped` & `/u/[username]/wrapped/[year]`):** Year-in-review editorial report with monthly completion bar charts, category breakdowns, and top-rated masterworks.
- **Next Airdate Radar & Weekly Calendar:** Real-time broadcast schedule for in-progress series and seasonal anime with 1-click episode logging.
- **Where to Watch Badges:** Country-aware streaming availability badges (Netflix, Max, Crunchyroll, Prime Video, Disney+) via TMDB & JustWatch.
- **Anime Filler Guide:** Episode-by-episode breakdown distinguishing Manga Canon, Anime Canon, and Filler episodes via Jikan v4 / MAL.
- **RSS 2.0 & Atom 1.0 Feeds:** Public web syndication via `/u/[username]/rss.xml` and `/u/[username]/atom.xml`.

---

## 🗄️ Database Schema Reference

The database consists of 18 relational tables managed via Drizzle ORM:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATABASE TABLES MAP                              │
├──────────────────────┬──────────────────────────────────────────────────────┤
│ user                 │ User profile, credentials, theme tokens, goals, bio  │
│ session              │ Better Auth HTTP-only active session tokens          │
│ account              │ Third-party authentication accounts and credentials  │
│ verification         │ Secure email verification and password reset tokens  │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ media_entries        │ Core titles (shows, movies, anime, manga, books)     │
│ media_activity_logs  │ Granular timestamped log of all user media actions   │
│ media_cycles         │ Multi-cycle rewatch and reread history records       │
│ media_quotes         │ Memorable quotes with speaker attribution & citations│
│ media_tags           │ User-defined shelves and tag taxonomy                │
│ media_entry_tags     │ Many-to-many join table between entries and tags     │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ user_goals           │ Annual reading challenges and completion targets     │
│ external_api_cache   │ External API response cache with TTL expiration      │
│ profile_comments     │ 7-day TTL public profile guestbook messages          │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ stacks               │ Curated editorial anthologies and thematic lists     │
│ stack_items          │ Ordered titles and custom annotations in a stack     │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ friendships          │ User friendship graph (pending, accepted, rejected)  │
│ groups               │ Collaborative group workspaces and shared archives  │
│ group_members        │ Group membership and role assignments (owner/member) │
│ group_messages       │ 7-day TTL group chat messages with markdown/spoilers │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 🌐 API & Route Handlers

ZedArchive exposes clean, cache-optimized Route Handlers for external integrations:

| Endpoint                 | Method        | Cache Control      | Purpose                                                |
| :----------------------- | :------------ | :----------------- | :----------------------------------------------------- |
| `/api/auth/[...all]`     | `GET`, `POST` | Dynamic            | Better Auth authentication catch-all endpoint.         |
| `/api/search/shows`      | `GET`         | `s-maxage=86400`   | TV series search via TVMaze.                           |
| `/api/search/movies`     | `GET`         | `s-maxage=3600`    | Movie search via TMDB API.                             |
| `/api/search/anime`      | `GET`         | `s-maxage=86400`   | Anime and manga search via AniList GraphQL.            |
| `/api/search/books`      | `GET`         | `s-maxage=86400`   | Book and volume search via OpenLibrary / Google Books. |
| `/api/search/users`      | `GET`         | `s-maxage=10`      | Fast username/handle autocomplete for public archives. |
| `/api/shows/airdate`     | `GET`         | `max-age=21600`    | Batch airdate lookup for in-progress series.           |
| `/api/anime/filler`      | `GET`         | `s-maxage=2592000` | Episode-by-episode filler/canon breakdown via Jikan.   |
| `/api/media/providers`   | `GET`         | `s-maxage=86400`   | Country-aware streaming provider availability badges.  |
| `/api/assets/upload`     | `POST`        | Private            | Sanitized image upload and WebP transcoding endpoint.  |
| `/u/[username]/rss.xml`  | `GET`         | `s-maxage=3600`    | Public archive RSS 2.0 XML feed.                       |
| `/u/[username]/atom.xml` | `GET`         | `s-maxage=3600`    | Public archive Atom 1.0 XML feed.                      |

---

## 🧪 Testing Strategy & Quality Assurance

The codebase maintains automated test coverage across unit, integration, and end-to-end boundaries:

```
tests/
├── unit/                       # 17 Unit Test Suites (Vitest)
│   ├── airdate.test.ts         # Broadcast date computation & timezone parsing
│   ├── backup.test.ts          # Multi-platform JSON/CSV/XML parser roundtrips
│   ├── calendar.test.ts        # Weekly schedule drawer date windowing
│   ├── color.test.ts           # WCAG 2.1 mathematical luminance & contrast ratio validation
│   ├── email.test.ts           # Transactional HTML email template generation
│   ├── filler-guide.test.ts    # Jikan/MAL filler episode map resolvers
│   ├── format.test.ts          # Text formatting, initials, and date formatters
│   ├── handles.test.ts         # Username handle sanitization & regex rules
│   ├── heatmap.test.ts         # 52-week activity cell bucketing algorithms
│   ├── markdown.test.tsx       # CommonMark parser and HTML sanitizer
│   ├── quotes.test.ts          # Quote attribution and clipboard string formatting
│   ├── season.test.ts          # Non-linear season progress stepping math
│   ├── serialize.test.ts       # Database-to-client DTO serialization
│   ├── spoilers.test.tsx       # Accessible click-to-reveal spoiler blackout components
│   ├── stats.test.ts           # Reading pace calculation and archive stats math
│   ├── sw-assets.test.ts       # Service worker precache manifest integrity
│   ├── taste-match.test.ts     # Taste comparison set intersection algorithms
│   └── tmdb.test.ts            # TMDB ID resolution and JustWatch provider extraction
├── integration/                # 10 Integration Test Suites (Vitest)
│   ├── account-deletion.test.ts# Atomic multi-table cascade deletion integrity
│   ├── airdate-route.test.ts   # Airdate batch lookup route handler
│   ├── comments.test.ts        # Ephemeral comments & reciprocity gate verification
│   ├── email-verification.ts   # Better Auth email verification token flow
│   ├── image-upload.test.ts    # Sharp/Canvas image transcoding & size limits
│   ├── media-actions.test.ts   # Server Actions (CRUD, steppers, rewatches)
│   ├── movie-search.test.ts    # TMDB search integration with fallback handling
│   ├── password-reset.test.ts  # Secure password reset token lifecycle
│   ├── profile.test.ts         # User profile and custom theme update actions
│   └── user-search.test.ts     # Public profile search DAL query verification
└── e2e/                        # 5 End-to-End Test Suites (Playwright)
    ├── auth.spec.ts            # User registration, email verification, sign-in & sign-out
    ├── backup-roundtrip.spec.ts# Exporting archive and restoring via importer
    ├── dashboard-shortcuts.spec# Command palette (Cmd+K) and keyboard navigation
    ├── media-lifecycle.spec.ts # End-to-end title addition, progress stepping, and completion
    └── public-profile.spec.ts  # Public archive discovery, guestbook, and taste matching
```

---

## 🚀 Local Quickstart & Development

### Prerequisites

- **Node.js ≥ 22.0.0** (enforced via `.nvmrc` and `package.json` engines)
- **Docker & Docker Compose** (for local PostgreSQL instance)
- **npm ≥ 10.0.0**

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/zelmari/zedarchive.git
cd zedarchive
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and configure local values:

```bash
cp .env.example .env.local
```

| Variable              | Required | Description / Default                                                                 |
| :-------------------- | :------: | :------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | **Yes**  | Postgres connection string (`postgres://postgres:postgres@localhost:5432/zedarchive`) |
| `BETTER_AUTH_SECRET`  | **Yes**  | 32+ character random secret for signing session cookies                               |
| `BETTER_AUTH_URL`     | **Yes**  | Canonical app URL (Default: `http://localhost:3000`)                                  |
| `NEXT_PUBLIC_APP_URL` | **Yes**  | Public frontend URL (Default: `http://localhost:3000`)                                |
| `TMDB_API_READ_TOKEN` | Optional | TMDB v4 Bearer Token for movie search and streaming badges                            |
| `RESEND_API_KEY`      | Optional | Resend API key for transactional email dispatch                                       |
| `EMAIL_FROM`          | Optional | Email sender string (Default: `ZedArchive <noreply@zedarchive.com>`)                  |

### 3. Start Database & Seed Sample Data

Run the automated one-step setup command to boot the Docker container, run database migrations, and seed initial test records:

```bash
npm run setup
```

_Or execute manually step-by-step:_

```bash
npm run docker:up        # Start PostgreSQL in background
npm run db:migrate       # Apply Drizzle ORM migrations
npm run db:seed          # Seed sample users, media titles, stacks, and tags
npm run dev              # Launch Next.js dev server on http://localhost:3000
```

### 4. Demo Login Credentials

You can sign in immediately using the pre-seeded demo user:

- **Email:** `demo@zedarchive.com`
- **Password:** `password123`
- **Public Handle:** `@zelmari` (viewable at `http://localhost:3000/u/zelmari`)

---

## 🛠️ Build & Test Commands

```bash
# Run unit & integration test suites
npm test

# Run tests in watch mode
npm run test:watch

# Run Playwright end-to-end test suite
npm run test:e2e

# Run linter and type-checking
npm run lint
npm run typecheck

# Build for local production preview
npm run build
npm run start

# Build for Cloudflare Workers (OpenNext)
npm run build:worker

# Deploy to Cloudflare Workers
npm run deploy
```

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).
