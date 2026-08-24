# ZEDARCHIVE UI SYSTEM SPECIFICATION (`UIGuide.md`)

> **Role & Purpose**: This document is the single, authoritative source of truth for all styling, layout, typography, animations, components, accessibility standards, and interaction patterns across **ZedArchive**. It captures the complete visual system and architecture established in the canonical `zedarchiveold` production codebase. Any AI coding agent or developer working on this codebase MUST strictly adhere to the tokens, patterns, and rules defined here.

---

## 1. Aesthetic Philosophy & Visual Identity

1. **Quiet Editorial Archive Foundation**:
   - The UI is grounded in a warm, tactile, editorial paper aesthetic rather than sterile cold tech minimalism or noisy decorative clutter.
   - The foundation uses a warm linen canvas (`#f7f5f0`), pristine white raised paper surfaces (`#ffffff`), and rich obsidian ink text (`#242321`).
   - Contrast is crisp and purposeful: borders delineate functional regions without visual vibration (`#85837c` for required interactive borders, `#d6d1c7` for subtle structural dividers).

2. **Tactile Paper Elevation**:
   - Elevation is communicated through subtle, multi-layered diffuse shadows that evoke physical cards resting on paper surfaces (`--za-shadow-raised`), not synthetic neon glows or harsh drops.
   - Modals and overlay dialogs float with a deep elevation shadow (`--za-shadow-layered`) above a darkened translucent backdrop (`rgba(23, 23, 22, 0.48)`).
   - Restricted or unavailable cards render quietly on subtle surface tiles (`#f0ede6`) with no drop shadow.

3. **Landscape 2:3 Media Layout**:
   - Media items (anime, books, shows) use a **landscape card layout** featuring a compact **2:3 aspect ratio** title tile / cover on the left and structured metadata, tracking controls, and actions on the right.
   - Covers and title tiles never dominate the card; they anchor the entry while leaving ample horizontal breathing room for titles, metadata, tags, and tracking steppers.

4. **Clarity Over Clutter**:
   - Interactive elements follow clear visual hierarchy:
     - **Primary Actions**: Solid ink fill (`#242321`) with pure white text.
     - **Secondary / Toggle Actions**: Paper surface with ink outline border.
     - **Tertiary Actions**: Transparent, quiet text buttons for cancel / dismiss flows.
     - **Destructive Launchers**: Outlined crimson (`#b4232e`), reserving solid crimson fills strictly for the final irreversible confirmation modal.

5. **Progressive Enhancement & Zero-JS Resilience**:
   - All critical catalogue browsing, searching, and pagination works natively via server-rendered HTML and standard HTTP `GET`/`POST` forms.
   - Client-side JavaScript progressively enhances the experience with optimistic state transitions, inline modal editors, focus management, and accessible live announcements.

---

## 2. Design Tokens & CSS Variable Architecture

All design tokens are defined in `:root` inside `src/app/globals.css` under the canonical `--za-*` namespace and mapped directly into the theme engine. Hardcoded arbitrary hex colors and magic values outside these tokens are strictly prohibited.

### Token Directory

```css
:root {
  /* ==========================================================================
     Canvas, Surfaces & Paper Fills
     ========================================================================== */
  --za-color-canvas: #f7f5f0;              /* Warm Linen / Editorial Canvas */
  --za-color-surface: #ffffff;             /* Crisp White Paper Surface */
  --za-color-surface-subtle: #f0ede6;      /* Subtle Neutral Surface / Restricted */

  /* ==========================================================================
     Text & Typography Ink
     ========================================================================== */
  --za-color-text: #242321;                /* Primary Ink (High Contrast Obsidian) */
  --za-color-text-muted: #5b5c61;          /* Secondary Muted Ink */
  --za-color-disabled-text: #64656a;       /* Inactive / Disabled Text */
  --za-color-disabled-surface: #ece9e2;    /* Inactive / Disabled Surface */

  /* ==========================================================================
     Borders & Structural Dividers
     ========================================================================== */
  --za-color-border-required: #85837c;     /* Controls, Inputs, Active Borders */
  --za-color-border-decorative: #d6d1c7;   /* Dividers, Subordinate Separators */

  /* ==========================================================================
     Interactive Accent (Ink Hierarchy)
     ========================================================================== */
  --za-color-accent: #242321;              /* Primary Accent Fill */
  --za-color-accent-hover: #3a3936;        /* Subtle Lightening on Hover */
  --za-color-accent-active: #171716;       /* Deepened Ink on Active Press */
  --za-color-accent-soft: #eeece7;         /* Selected / Highlighted Pill Soft Fill */
  --za-color-on-accent: #ffffff;           /* Pure White Text on Accent Fill */

  /* ==========================================================================
     Semantic & Destructive States
     ========================================================================== */
  --za-color-destructive: #b4232e;         /* Crimson Error / Destructive Action */
  --za-color-destructive-hover: #8f1d26;   /* Darkened Destructive Hover */
  --za-color-destructive-active: #76151c;  /* Deep Destructive Press */
  --za-color-on-destructive: #ffffff;      /* Text on Destructive Fills */
  --za-color-error-surface: #fbecee;       /* Soft Pink Error Notice Background */

  --za-color-success: #26734d;             /* Botanical Forest Green */
  --za-color-success-surface: #e9f4ee;     /* Soft Mint Success Background */

  --za-color-warning: #765a00;             /* Warm Amber / Ochre */
  --za-color-warning-surface: #f8f0d8;     /* Soft Ochre Warning Background */

  --za-color-information: #4b4a46;         /* Slate Charcoal Information */
  --za-color-information-surface: #f0ede6; /* Soft Slate Information Background */

  /* ==========================================================================
     Title Tile Placeholder
     ========================================================================== */
  --za-color-title-tile: #ded9cf;          /* 2:3 Initials Tile Background */
  --za-color-title-tile-text: #30353b;     /* Initials Text Color */

  /* ==========================================================================
     Typography & Text Scale
     ========================================================================== */
  --za-font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --za-text-fine: 0.75rem;                 /* 12px - Small captions & fine notes */
  --za-text-supporting: 0.875rem;          /* 14px - Helper text, metadata, labels */
  --za-text-base: 1rem;                    /* 16px - Standard body & inputs */
  --za-text-heading-sm: 1.125rem;          /* 18px - Card subheadings, brand */
  --za-text-heading-md: 1.25rem;           /* 20px - Card titles, section headers */
  --za-text-heading-lg: 1.5rem;            /* 24px - Page headings, modal titles */
  --za-text-heading-xl: 2rem;              /* 32px - Hero masthead titles */

  --za-leading-body: 1.6;
  --za-leading-compact: 1.35;
  --za-weight-body: 400;
  --za-weight-emphasis: 500;
  --za-weight-heading: 600;
  --za-measure-readable: 68ch;

  /* ==========================================================================
     Spacing & Layout Rhythm
     ========================================================================== */
  --za-space-unit: 0.25rem;                /* 4px base step */
  --za-space-1: 0.25rem;                   /* 4px */
  --za-space-2: 0.5rem;                    /* 8px */
  --za-space-3: 0.75rem;                   /* 12px */
  --za-space-4: 1rem;                      /* 16px */
  --za-space-6: 1.5rem;                    /* 24px */
  --za-space-8: 2rem;                      /* 32px */
  --za-space-12: 3rem;                     /* 48px */
  --za-page-gutter: 1rem;                  /* 16px mobile gutter, 24px desktop */

  /* ==========================================================================
     Container Widths
     ========================================================================== */
  --za-content-narrow: 28rem;              /* 448px - Auth, Login, Reset Password */
  --za-content-medium: 48rem;              /* 768px - Settings, Account Deletion */
  --za-content-wide: 64rem;                /* 1024px - Catalogue & Archive Grids */

  /* ==========================================================================
     Radii, Borders & Shadows
     ========================================================================== */
  --za-radius-small: 0.25rem;              /* 4px - Title tiles, active route pills */
  --za-radius-control: 0.5rem;             /* 8px - Controls, buttons, fields, notices, cards */
  --za-radius-layered: 0.75rem;            /* 12px - Modals, dialogs, elevated containers */
  --za-border-width: 1px;
  --za-control-min-block-size: 2.5rem;     /* 40px - Strict touch/click target min-height */

  --za-focus-width: 3px;
  --za-focus-offset: 3px;

  --za-shadow-raised: 0 1px 2px rgb(36 35 33 / 8%), 0 6px 16px rgb(36 35 33 / 6%);
  --za-shadow-layered: 0 18px 48px rgb(36 35 33 / 18%);
  --za-backdrop-modal: rgb(23 23 22 / 48%);

  /* ==========================================================================
     Layering (Z-Index Scale)
     ========================================================================== */
  --za-layer-content: 0;
  --za-layer-skip-link: 50;
  --za-layer-modal: 100;

  /* ==========================================================================
     Motion & Transitions
     ========================================================================== */
  --za-motion-fast: 150ms;
  --za-motion-reduced: 0.01ms;
  --za-ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

### Tailwind Theme Mapping

```css
@theme inline {
  --color-canvas: var(--za-color-canvas);
  --color-surface: var(--za-color-surface);
  --color-surface-subtle: var(--za-color-surface-subtle);
  --color-ink: var(--za-color-text);
  --color-ink-muted: var(--za-color-text-muted);
  --color-control: var(--za-color-border-required);
  --color-divider: var(--za-color-border-decorative);
  --color-accent: var(--za-color-accent);
  --color-accent-hover: var(--za-color-accent-hover);
  --color-accent-active: var(--za-color-accent-active);
  --color-accent-soft: var(--za-color-accent-soft);
  --color-on-accent: var(--za-color-on-accent);
  --color-destructive: var(--za-color-destructive);
  --color-destructive-hover: var(--za-color-destructive-hover);
  --color-destructive-active: var(--za-color-destructive-active);
  --color-on-destructive: var(--za-color-on-destructive);
  --color-error-surface: var(--za-color-error-surface);
  --color-success: var(--za-color-success);
  --color-success-surface: var(--za-color-success-surface);
  --color-warning: var(--za-color-warning);
  --color-warning-surface: var(--za-color-warning-surface);
  --color-information: var(--za-color-information);
  --color-information-surface: var(--za-color-information-surface);
  --color-disabled: var(--za-color-disabled-text);
  --color-disabled-surface: var(--za-color-disabled-surface);
  --color-title-tile: var(--za-color-title-tile);
  --color-title-tile-text: var(--za-color-title-tile-text);
  --font-sans: var(--za-font-sans);
  --radius-small: var(--za-radius-small);
  --radius-control: var(--za-radius-control);
  --radius-layered: var(--za-radius-layered);
  --shadow-layered: var(--za-shadow-layered);
  --shadow-raised: var(--za-shadow-raised);
}
```

---

## 3. Typography, Spatial Scale & Containers

### Typographic Hierarchy

| Role | Token / Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Page Title (XL)** | `var(--za-text-heading-xl)` (32px / 2rem) | 600 (`semibold`) | `var(--za-leading-compact)` (1.35) | Main page mastheads (e.g., "Anime catalogue") |
| **Section Header (LG)** | `var(--za-text-heading-lg)` (24px / 1.5rem) | 600 (`semibold`) | `var(--za-leading-compact)` (1.35) | Section titles, settings headings, modal titles |
| **Card Title (MD)** | `var(--za-text-heading-md)` (20px / 1.25rem) | 600 (`semibold`) | `var(--za-leading-compact)` (1.35) | Media entry titles, empty state headlines |
| **Brand / Subhead (SM)** | `var(--za-text-heading-sm)` (18px / 1.125rem) | 600 (`semibold`) | `var(--za-leading-compact)` (1.35) | Wordmark text, modal sub-headers |
| **Body Primary** | `var(--za-text-base)` (16px / 1rem) | 400 (`normal`) | `var(--za-leading-body)` (1.6) | Paragraphs, descriptions, inputs |
| **Supporting / Muted** | `var(--za-text-supporting)` (14px / 0.875rem) | 400 or 500 | `var(--za-leading-body)` (1.6) | Form labels, helper text, card metadata |
| **Fine / Captions** | `var(--za-text-fine)` (12px / 0.75rem) | 400 | `var(--za-leading-compact)` (1.35) | Timestamps, micro-badges |

### Spatial Containers

- **Wide Container (`.za-container--wide`)**: Max-width `64rem` (1024px). Standard for media grids, catalogue listings, and archive collections.
- **Medium Container (`.za-container--medium`)**: Max-width `48rem` (768px). Standard for settings pages, account preferences, and recovery views.
- **Narrow Container (`.za-container--narrow`)**: Max-width `28rem` (448px). Standard for single-column auth views: Sign in, Register, Forgot Password, Reset Password, Verify Email.
- **Responsive Guttering**:
  ```css
  .za-container {
    inline-size: min(calc(100% - (var(--za-page-gutter) * 2)), var(--za-content-wide));
    margin-inline: auto;
  }
  @media (min-width: 40rem) {
    .za-container {
      --za-page-gutter: 1.5rem;
    }
  }
  ```

---

## 4. Component Directory & CSS Specifications (`.za-*`)

All component classes use the `.za-*` prefix.

### 4.1. Skip Link (`.za-skip-link`)
Accessible keyboard bypass directly to the main landmark:
```css
.za-skip-link {
  position: absolute;
  inset-block-start: var(--za-space-4);
  inset-inline-start: var(--za-space-4);
  z-index: var(--za-layer-skip-link);
  border: var(--za-border-width) solid var(--za-color-border-required);
  border-radius: var(--za-radius-control);
  background: var(--za-color-surface);
  padding: var(--za-space-2) var(--za-space-3);
  color: var(--za-color-text);
}

.za-skip-link:not(:focus-visible) {
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
```

### 4.2. Site Header & Wordmark
```
+-----------------------------------------------------------------------------------+
|  [Logo 72x48] zedarchive          [ My anime (button) ]   @username   Settings   Sign out |
+-----------------------------------------------------------------------------------+
```
- **Header Container (`.za-site-header`)**:
  - `background: var(--za-color-surface); border-block-end: 1px solid var(--za-color-border-decorative);`
  - Inner layout: Grid on mobile (stacking brand, primary nav, account nav), flex on desktop (`min-width: 40rem; justify-content: space-between; align-items: center;`).
- **Wordmark (`.za-wordmark`)**:
  - `display: inline-flex; align-items: center; gap: 0.5rem;`
  - Logo Mark (`.za-wordmark__mark`): Fixed `width: 3.75rem; height: 2.5rem;` (mobile) -> `4.5rem x 3rem` (desktop), `object-fit: contain`.
  - Brand Text (`.za-wordmark__text`): `font-size: 1.125rem; font-weight: 600; letter-spacing: -0.025em; color: var(--za-color-text);`.
- **Current Page Link (`.za-current-page`)**:
  - `background: var(--za-color-accent-soft); box-shadow: inset 0 -2px 0 var(--za-color-accent); font-weight: 600; border-radius: 4px;`
  - When used as a button (`.za-button.za-current-page`), keeps selected borders and soft accent fill.

### 4.3. Buttons (`.za-button`)
All buttons enforce a minimum touch block-size of `2.5rem` (40px) with `0.5rem` (8px) radius:

```css
.za-button {
  min-block-size: var(--za-control-min-block-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--za-space-2);
  padding: var(--za-space-2) var(--za-space-3);
  border: var(--za-border-width) solid var(--za-color-border-required);
  border-radius: var(--za-radius-control);
  font: inherit;
  font-weight: var(--za-weight-emphasis);
  line-height: var(--za-leading-compact);
  text-align: center;
  transition:
    background-color var(--za-motion-fast) var(--za-ease-standard),
    border-color var(--za-motion-fast) var(--za-ease-standard),
    color var(--za-motion-fast) var(--za-ease-standard),
    box-shadow var(--za-motion-fast) var(--za-ease-standard),
    outline-color var(--za-motion-fast) var(--za-ease-standard),
    opacity var(--za-motion-fast) var(--za-ease-standard);
}
```

#### Button Variants
- **Primary (`.za-button--primary`)**:
  - Base: `background: var(--za-color-accent); border-color: var(--za-color-accent); color: var(--za-color-on-accent);`
  - Hover: `background: var(--za-color-accent-hover); border-color: var(--za-color-accent-hover);`
  - Active: `background: var(--za-color-accent-active); border-color: var(--za-color-accent-active);`
- **Secondary (`.za-button--secondary`)**:
  - Base: `background: var(--za-color-surface); border-color: var(--za-color-border-required); color: var(--za-color-accent);`
  - Hover: `background: var(--za-color-accent-soft); border-color: var(--za-color-accent);`
  - Active: `border-color: var(--za-color-accent-active); color: var(--za-color-accent-active);`
- **Tertiary / Ghost (`.za-button--tertiary`)**:
  - Base: `background: transparent; border-color: transparent; color: var(--za-color-accent);`
  - Hover: `background: var(--za-color-accent-soft);`
  - Active: `color: var(--za-color-accent-active);`
- **Selected Toggle (`.za-button--selected`)**:
  - Base: `background: var(--za-color-accent-soft); border-color: var(--za-color-accent); color: var(--za-color-accent);`
  - Hover: `background: var(--za-color-surface-subtle); border-color: var(--za-color-accent-hover);`
- **Destructive Solid (`.za-button--destructive`)**:
  - Base: `background: var(--za-color-destructive); border-color: var(--za-color-destructive); color: var(--za-color-on-destructive);`
  - Hover: `background: var(--za-color-destructive-hover); border-color: var(--za-color-destructive-hover);`
  - Active: `background: var(--za-color-destructive-active); border-color: var(--za-color-destructive-active);`
  - *Usage*: ONLY for irreversible final action confirmation inside confirmation dialogs.
- **Destructive Outline (`.za-button--destructive-outline`)**:
  - Base: `background: var(--za-color-surface); border-color: var(--za-color-destructive); color: var(--za-color-destructive);`
  - Hover: `background: var(--za-color-error-surface); border-color: var(--za-color-destructive-hover); color: var(--za-color-destructive-hover);`
  - *Usage*: Triggering a deletion/removal modal from a card or settings section.
- **Disabled State (`:disabled`)**:
  - `background: var(--za-color-disabled-surface); border-color: var(--za-color-border-required); color: var(--za-color-disabled-text); cursor: not-allowed;`

### 4.4. Form Inputs & Selects (`.za-field`, `.za-select`)
- Base properties: `min-block-size: 2.5rem; border: 1px solid var(--za-color-border-required); border-radius: 8px; background: var(--za-color-surface); color: var(--za-color-text); padding: 0.5rem 0.75rem; inline-size: 100%;`
- Invalid state (`[aria-invalid="true"]`): `border-color: var(--za-color-destructive);`
- Structure:
  ```html
  <div class="flex flex-col gap-1">
    <label class="text-sm font-medium" for="field-id">Field Label</label>
    <input class="za-field" id="field-id" name="fieldName" aria-invalid="false" />
    <p class="text-sm text-ink-muted" id="field-id-hint">Helpful guidance text.</p>
  </div>
  ```

### 4.5. Notices & Status Banners (`.za-notice`)
Notices communicate feedback, validation errors, and operational states:
```css
.za-notice {
  border: var(--za-border-width) solid currentcolor;
  border-radius: var(--za-radius-control);
  padding: var(--za-space-3) var(--za-space-4);
}
.za-notice--information {
  background: var(--za-color-information-surface);
  color: var(--za-color-information);
}
.za-notice--success {
  background: var(--za-color-success-surface);
  color: var(--za-color-success);
}
.za-notice--warning {
  background: var(--za-color-warning-surface);
  color: var(--za-color-warning);
}
.za-notice--error {
  background: var(--za-color-error-surface);
  color: var(--za-color-destructive);
}
```

### 4.6. Cards & Containers (`.za-card`)
- Base: `background: var(--za-color-surface); border: 1px solid var(--za-color-border-required); border-radius: 8px; padding: 1rem;`
- Raised Paper (`.za-card--raised`): `box-shadow: var(--za-shadow-raised);`
- Layered Paper (`.za-card--layered`): `border-radius: 12px; box-shadow: var(--za-shadow-layered);`
- Restricted (`.za-card--restricted`): `background: var(--za-color-surface-subtle); border-color: var(--za-color-border-decorative); box-shadow: none;`

---

## 5. Media & Archive Cards Layout Specification

Media entries follow a structured **Landscape Card Layout** with a fixed **2:3 title tile** or poster on the left and metadata + interactive controls on the right.

### 5.1. Visual Wireframe

```
+-----------------------------------------------------------------------------------+
|  +--------------+  Title of the Anime / Book / Show                               |
|  |              |  2024 · 12 episodes · Finished Airing                           |
|  |  2:3 Tile /  |  Adult content (if applicable)                                  |
|  |  Cover Art   |                                                                 |
|  |  7rem width  |                                                                 |
|  |  Initials    |                                                                 |
|  +--------------+                                                                 |
| --------------------------------------------------------------------------------- |
|  [ Action Zone / Tracking Controls: Status, Progress, Rating, Dates, Removal ]    |
+-----------------------------------------------------------------------------------+
```

### 5.2. Title Tile Component (`.za-title-tile`)
When an image is loading, omitted, or synthetic initials are rendered:
```css
.za-title-tile {
  display: grid;
  aspect-ratio: 2 / 3;
  place-items: center;
  border-radius: var(--za-radius-small);
  background: var(--za-color-title-tile);
  color: var(--za-color-title-tile-text);
  font-size: var(--za-text-heading-lg);
  font-weight: var(--za-weight-heading);
}
```
- **Tile Sizing**: `inline-size: min(7rem, 100%); flex: 0 1 7rem;` (approx 112px wide by 168px tall, strict 2:3 proportion).

### 5.3. Catalogue Card Structure (`.za-catalogue-card`)
- **Card Root**: `.za-card .za-card--raised .za-catalogue-card`
- **Summary Row (`.za-catalogue-card__summary`)**:
  - `display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1rem;`
- **Details Column (`.za-catalogue-card__details`)**:
  - `display: grid; min-inline-size: 0; flex: 1 1 10rem; align-content: start; gap: 0.5rem; overflow-wrap: anywhere;`
  - Title: Heading Level 2 (`font-size: 1.25rem; font-weight: 600; leading: 1.35; line-clamp: none;`).
  - Meta info: `font-size: 0.875rem; color: var(--color-ink-muted);`
- **Action Zone (`.za-catalogue-card__action`)**:
  - `inline-size: 100%; margin-block-start: auto; border-block-start: 1px solid var(--za-color-border-decorative); padding-block-start: 0.75rem;`
  - Renders the `<AddAnimeEntryForm>` (with a status select + primary "Add to archive" button) or the `.za-catalogue-card__saved` indicator badge ("In your archive — {Status}").

### 5.4. Archive Card Structure (`.za-archive-card`)
- **Card Root**: `.za-archive-card .za-card .za-card--raised`
- **Tracking Zone (`.za-archive-card__tracking`)**:
  - Separated by `border-block-start: 1px solid var(--za-color-border-decorative); padding-block-start: 0.75rem;`
  - Houses the **Tracking Coordinator**:
    1. **Status Form**: Readout with "Edit status" trigger -> inline status selector with Save & Cancel.
    2. **Rating Form**: Rating display (`X/10` or `Not rated`) -> inline 1-10 decimal input with Save, Remove rating, Cancel.
    3. **Favourite Control**: Pill toggle button (`Add to favourites` / `Remove from favourites` with `.za-button--selected`).
    4. **Date Range Form**: Start & Finish dates display -> inline HTML5 date inputs with clear & cancel capabilities.
    5. **Episode / Chapter Progress**:
       - Displays "Progress — X episodes" and "Total — Y episodes".
       - Edit Progress button opens numeric input with Save & Cancel.
       - "Change personal total" opens override input with "Remove personal total" / "Use catalogue total" option.
       - "Reset progress" button with dedicated warning confirmation.
       - **Auto-completion offer**: When progress reaches total, prompts with a warning banner: *"You've reached the total of X episodes. Mark this entry as Completed?"* with primary "Mark completed" and secondary "Keep current status".
    6. **Removal Control (`.za-archive-card__removal`)**:
       - Trigger: `.za-button--destructive-outline` ("Remove from archive").
       - Opens native `<dialog className="za-dialog">` confirmation modal.

---

## 6. Dialogs & Modals (`.za-dialog`)

Modals use the native `<dialog>` element with custom accessible styling:

```css
.za-dialog {
  z-index: var(--za-layer-modal);
  max-block-size: calc(100dvh - (var(--za-space-4) * 2));
  inline-size: calc(100% - (var(--za-space-4) * 2));
  max-inline-size: 32rem;
  margin: auto;
  overflow-y: auto;
  border: var(--za-border-width) solid var(--za-color-border-required);
  border-radius: var(--za-radius-layered);
  background: var(--za-color-surface);
  box-shadow: var(--za-shadow-layered);
  padding: var(--za-space-4);
  color: var(--za-color-text);
}

.za-dialog::backdrop {
  background: var(--za-backdrop-modal);
}
```

### Modal Accessibility & Keyboard Handling:
- Must use `dialogRef.current.showModal()` to engage the browser top layer and native focus trapping.
- Listen to `onCancel` to cleanly sync internal state and close the dialog when `[Escape]` is pressed.
- On close/dismiss, focus MUST programmatically return to the launcher trigger button.
- On confirm/delete success, focus moves to the live status alert region.

---

## 7. Responsive Grid Matrix

Responsive layouts adapt across mobile, tablet, and desktop viewports without horizontal overflow:

```html
<ul class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
  <!-- Card Items -->
</ul>
```

| Viewport Breakpoint | Columns | Container Max Width | Page Gutter |
| :--- | :--- | :--- | :--- |
| **Mobile (`< 640px`)** | `1 column` | `100%` | `1rem` (16px) |
| **Tablet (`sm: 640px - 1023px`)** | `2 columns` | `min(100%, 64rem)` | `1.5rem` (24px) |
| **Desktop (`lg: 1024px+`)** | `3 columns` | `64rem` (1024px) | `1.5rem` (24px) |

---

## 8. State Management & Micro-Interactions

1. **Inline Form Editing Pattern**:
   - Every property in the archive card (Status, Rating, Dates, Progress) supports an independent inline editor.
   - Transitioning between `read` and `edit` modes swaps the DOM node and uses a `focusAfterRender` microtask (`setTimeout(() => target.focus())`) to immediately focus the active input or trigger.
2. **Snappy Motion**:
   - Standard transitions run at `150ms` using `cubic-bezier(0.2, 0, 0, 1)`.
   - Hover states subtly brighten surfaces or sharpen borders. Never flash contrasting background inversions.
3. **Focus Ring Contract**:
   - All interactive controls implement a high-visibility focus ring:
     ```css
     :focus-visible {
       outline: var(--za-focus-width) solid var(--za-color-accent);
       outline-offset: var(--za-focus-offset);
     }
     ```
4. **Live Feedback Announcements**:
   - Error messages render with `role="alert"` and trigger immediate focus.
   - Successful actions announce politely via `role="status"` and `aria-live="polite"`.

---

## 9. Accessibility, High Contrast & Reduced Motion

1. **Windows High Contrast / Forced Colors (`forced-colors: active`)**:
   - `forced-color-adjust: none` is NEVER used.
   - Focus rings automatically map to system `Highlight`:
     ```css
     @media (forced-colors: active) {
       :focus-visible {
         outline-color: Highlight;
       }
       .za-current-page {
         background: Canvas;
         box-shadow: inset 0 -2px 0 Highlight;
         color: LinkText;
       }
       .za-wordmark.za-current-page {
         text-decoration-line: underline;
         text-decoration-style: double;
       }
       .za-button.za-current-page {
         border-color: Highlight;
       }
     }
     ```
2. **Increased Contrast Preference (`prefers-contrast: more`)**:
   - Elevates decorative borders and muted text to high-contrast tokens:
     ```css
     @media (prefers-contrast: more) {
       :root {
         --za-color-text-muted: var(--za-color-text);
         --za-color-border-decorative: var(--za-color-border-required);
       }
     }
     ```
3. **Reduced Motion (`prefers-reduced-motion: reduce`)**:
   - Shrinks transitions and animations to `0.01ms`:
     ```css
     @media (prefers-reduced-motion: reduce) {
       .za-link,
       .za-button,
       .za-field,
       .za-select {
         transition-duration: var(--za-motion-reduced);
         animation-duration: var(--za-motion-reduced);
         animation-iteration-count: 1;
       }
     }
     ```
4. **200% Zoom & Large Text Resilience**:
   - Text containers MUST use `overflow-wrap: anywhere;` and `min-width: 0;` to prevent text or card clipping at 200% text scale.
   - Horizontal scrolling on the root viewport is strictly disallowed at any scale.

---

## 10. Strict Anti-Patterns (What NOT to Do)

- ❌ **NO Hardcoded Hex/RGB Colors**: Never use arbitrary inline color styles (`#123456`, `rgba(...)`) in JSX or CSS modules. Always reference canonical `--za-*` CSS variables or semantic Tailwind aliases.
- ❌ **NO Native `alert()`, `confirm()`, or `prompt()`**: Never trigger browser dialog popups. Always use native `<dialog className="za-dialog">` or inline feedback notices.
- ❌ **NO Overbearing Vertical Posters**: Do not render massive vertical posters that force media details off screen. Always use the compact 2:3 title-tile landscape card layout.
- ❌ **NO Premature Solid Destructive Buttons**: Never style a destructive launcher button (e.g. "Remove from archive", "Delete account") with solid red background on the main surface. Use `.za-button--destructive-outline`, reserving solid `.za-button--destructive` solely for the confirmation modal dialog.
- ❌ **NO Missing Skip Links or Unreachable Landmarks**: Always provide the `.za-skip-link` anchoring to `<main id="main-content" tabIndex={-1}>`.
- ❌ **NO Missing Focus Restorations**: Never close a modal or finish an inline edit without returning focus to the trigger or announcing status via an accessible live region.