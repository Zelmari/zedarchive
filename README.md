<div align="center">
  <img src="public/zedarchivelogo.png" alt="ZedArchive Logo" width="120" />
  
  # ZedArchive
  
  **A quiet, distraction-free media archive for your TV series, anime, novels, and books.**

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

Whether you're bingeing a multi-season show, following seasonal anime, reading multi-volume light novels, or pacing through classic literature, ZedArchive keeps your progress in sync without distractions.

---

## ✨ Features

### 🔍 Spotlight Search-First Add Flow
* **Instant Catalogue Autofill:** Search TV series via TVMaze, Anime & Manga via AniList, and Books via Google Books.
* **Auto Structure & Metadata:** Automatically fetches season-by-season episode breakdowns, volume counts, release years, genres, and compressed cover art.
* **Pre-Save Review:** Expand into a full detail form to customize starting progress, select status, set personal ratings, and add review notes before saving.
* **Manual Entry Escape:** Press <kbd>Esc</kbd> anytime in the search window to transition directly to manual creation.

### 🎛️ Granular Progress Tracking
* **Season-Aware Steppers:** Dynamic season switching where episode totals adjust dynamically per season.
* **Multi-Volume & Chapter Steppers:** Volume steppers paired with direct chapter/page input fields.
* **Auto-Completion Trigger:** Reaching maximum progress prompts an interactive completion confirmation with exact timestamps.

### 🎨 Account-Synced Themes
Choose an aesthetic that matches your taste, stored in your database account so it syncs across your phone, tablet, and laptop:
* 📜 **Parchment (Default):** Warm linen paper, charcoal ink, and subtle slate borders.
* 🌑 **Midnight Slate:** Deep graphite and obsidian dark mode with crisp white text.
* 📖 **Vintage Sepia:** Warm amber, aged book paper, and terracotta highlights.
* ⬛ **E-Ink Monochrome:** High-contrast pure black and white mimicking physical e-readers.
* 📟 **Phosphor Cyber:** Retro terminal dark mode with glowing green CRT phosphor accents.

### 📖 Card Detailed View & Rewatch Tracker
* **Editorial Deep Dive:** Click any card's artwork or title to inspect full synopsis, metadata, and personal notes.
* **Interactive Numbered Grid:** Quick-jump checklist to mark off individual episodes or chapters.
* **Rewatch / Reread Counter:** Start a rewatch/reread with one click to increment your counter and reset progress without losing previous completion history.

### 🏷️ Custom Shelves & Tags
* Organize titles with custom tags like `#favorites`, `#cozy`, `#summer-2026`, or `#must-read`.
* Filter your dashboard collection by any shelf with a single click in the toolbar.

### 📅 Activity Timeline & Habit Streaks
* **Event Stream:** Every episode watched, chapter read, status change, and rewatch is recorded with timestamps.
* **Habit Streaks:** Daily reading and watching streak counter to encourage consistent habits.

### 🌐 Public Shareable Profiles (`/u/[username]`)
* **Shareable Link:** Showcase your curated library, top-rated masterworks, and stats with friends.
* **Privacy Toggle:** Private by default. Toggle between *Public* and *Private* at any time in the Share modal.

### 💾 Data Sovereignty (Backup & Import)
* **1-Click Export:** Download your entire library anytime as standard **JSON** or spreadsheet-ready **CSV**.
* **Multi-Platform Importer:** Seamlessly import backups from **ZedArchive**, **AniList JSON**, and **Goodreads CSV** with automatic conflict resolution (*Skip* vs *Overwrite*).

### ⌨️ Keyboard-First Power Shortcuts
* <kbd>N</kbd> or <kbd>⌘K</kbd> — Open Add Media Spotlight
* <kbd>/</kbd> — Instant focus archive search
* <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> — Switch between Total, Shows, and Books tabs
* <kbd>T</kbd> — Open Theme & Aesthetic switcher
* <kbd>S</kbd> — Open Archive Statistics
* <kbd>B</kbd> — Open Backup & Import dialog
* <kbd>?</kbd> — View Keyboard Shortcuts cheat sheet

---

## 🛠️ Tech Stack & Architecture

* **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React Server Components & Server Actions)
* **Edge Deployment:** [Cloudflare Workers](https://workers.cloudflare.com/) powered by [OpenNext](https://opennext.js.org/cloudflare)
* **Database & ORM:** [PostgreSQL](https://www.postgresql.org/) (hosted on [Supabase](https://supabase.com/)) with [Drizzle ORM](https://orm.drizzle.team/)
* **Authentication:** [Better Auth](https://better-auth.com/) with scrypt password hashing and HTTP-only session cookies
* **Icons:** [Lucide Icons](https://lucide.dev/)
* **Design & Styling:** Pure CSS Modules with semantic CSS custom properties and responsive mobile-first layouts

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
