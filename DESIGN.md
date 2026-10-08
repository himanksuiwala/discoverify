# Archetype Recovery Operations — Design System & UI/UX Specification

**Document:** DESIGN.md  
**Product:** Archetype LPR Vehicle Recovery Operations  
**Architecture:** React 19, TypeScript, Vite, Vanilla CSS Architecture  
**Typography:** Inter (via Google Fonts) with Tabular Numerals & Monospace Code fallbacks  

---

## 1. Design Philosophy & Aesthetic Identity

Archetype Operations is an operational intelligence workstation engineered for vehicle recovery agencies, field staff, and administrative teams. The visual style embodies **Editorial Industrial Brutalism**:

- **Tactile & Authoritative:** High-contrast, sharp-cornered geometry inspired by technical drafting blueprints, flight operation manifests, and physical situation-room clipboards.
- **Low Cognitive Overhead:** Eliminates fuzzy neumorphic gradients, floating pastel shadows, and decorative clutter. Every visual element has a functional purpose.
- **Architectural Grid Blueprint:** Canvas surfaces feature a continuous 32px × 32px millimeter drafting grid, giving the workspace an authentic tactical intelligence aesthetic.
- **Hard-Edged Elevation:** Physical, hard-offset drop shadows (`3px` to `10px` solid offsets) that depress on interaction, delivering an unmistakable, tactile feedback loop.
- **Unified Modern Typography:** Clean, high-legibility **Inter** sans-serif paired with strict **tabular numerals** for timestamps, case numbers, and coordinates.

---

## 2. Color System & Design Tokens

Colors are defined as semantic CSS custom properties in `:root` and organized into tonal surfaces, operational accents, and strict status indicators.

### 2.1 Core Neutral & Surface Tokens

| Token | Hex Value | Semantic Role |
|---|---|---|
| `--paper` | `#f4f1e9` | Warm tactile parchment background canvas |
| `--surface` | `#fffdf7` | Elevated content surfaces, cards, and input fields |
| `--ink` | `#17211d` | Primary headline, body typography, and high-contrast borders |
| `--muted` | `#69716b` | Secondary descriptions, column headers, and helper copy |
| `--line` | `#c9ccc4` | Subtle structural dividing rules and table borders |
| `--line-dark` | `#9ea59d` | High-contrast container borders and structural separators |

### 2.2 Brand & Operational Accents

| Token | Hex Value | Semantic Role |
|---|---|---|
| `--forest` | `#173b32` | Deep operational evergreen: Sidebar shell, dark primary buttons, timeline nodes, avatar badges |
| `--forest-light` | `#28584b` | Hover state for forest buttons and active items |
| `--signal` | `#e25d33` | Safety high-visibility burnt orange: Brand mark, primary action triggers, claim buttons, active sidebar borders |
| `--signal-dark` | `#b84120` | Hover and active pressed states for signal buttons |
| `--focus-ring` | `#f0a388` | High-visibility focus indicator outline (`3px solid #f0a388`) |

### 2.3 Status & Alert Indicators

Every state combines a text label with background and text color to ensure accessibility:

| Status / State | Foreground | Background | Usage |
|---|---|---|---|
| **`ACTIVE`** | `#17654e` | `#e1f4eb` | Confirmed tenant-owned cases currently in progress |
| **`PENDING_CLAIM`** | `--amber` (`#8b5a0a`) | `--amber-paper` (`#fff2cf`) | Unassigned platform cases available in the shared claim pool |
| **`CLOSED`** | `--closed` (`#5f6863`) | `--closed-paper` (`#eceeea`) | Resolved or archived recovery cases |
| **`ERROR / DANGER`** | `--danger` (`#8f2517`) | `#fde8df` / `#fff7f1` | Form validation failures, claim collision conflicts, API errors |

---

## 3. Surface & Grid System

### 3.1 Drafting Blueprint Canvas
The entire app canvas utilizes a double linear gradient pattern creating an authentic 32px blueprint grid:

```css
body {
  background:
    linear-gradient(90deg, rgb(23 33 29 / 0.035) 1px, transparent 1px),
    linear-gradient(rgb(23 33 29 / 0.035) 1px, transparent 1px),
    var(--paper);
  background-size: 32px 32px;
}
```

### 3.2 Atmospheric Authentication Canvas
The authentication screen balances the tactile paper grid with a deep atmospheric situation-room hero panel:
- Left Hero Panel: Radial glow (`rgb(226 93 51 / 0.42)`) over deep forest green (`#183d34` → `#102921` → `#0a1a16`).
- Geometric Radar Rings: Concentric circular pseudo-elements (`box-shadow: 0 0 0 4rem ...`) simulating optical range rings.

---

## 4. Typography & Numerical Rhythm

The system uses **Inter** loaded via Google Fonts CDN with preconnect headers, paired with system fallbacks and a strict monospace boundary.

```css
font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

### 4.1 Type Scale & Hierarchy

| Role | Font Size | Weight | Tracking / Line Height | Application |
|---|---|---:|---|---|
| **Display Hero** | `clamp(2.6rem, 6vw, 5.2rem)` | 700 | `-0.04em` / `1.02` | Login hero statement, case page major titles |
| **Page Title** | `clamp(1.85rem, 3.5vw, 2.75rem)` | 600 | `-0.03em` / `1.12` | Section headings, dialog titles, profile header |
| **Case Target** | `clamp(3.4rem, 18vw, 5.5rem)` | 700 | `-0.04em` / `1.0` | Target license plate on Case Detail hero |
| **Metric Digit** | `2.0rem` | 600 | Tabular-nums / `1.0` | Case register record count tile |
| **Coordinates** | `clamp(1.6rem, 2.5vw, 2.2rem)` | 600 | `-0.02em`, Tabular-nums / `1.15` | Latest sighting latitude / longitude display |
| **Section Header** | `1.05rem` – `1.2rem` | 600 | Standard / `1.3` | Scan entry title, vehicle identity, modal subtitle |
| **Body / Inputs** | `0.82rem` – `0.875rem` | 400 | Standard / `1.55` | Table cell copy, descriptions, input form values |
| **Kickers & Tags** | `0.65rem` – `0.70rem` | 700 | `0.08em` – `0.12em` Uppercase | Category tags, workspace steps, section labels |
| **Badges & Headers**| `0.62rem` – `0.65rem` | 600–700 | `0.08em` Uppercase | Status badges, table headers (`<th>`), step tags |
| **Inline Code** | `0.62rem` – `0.72rem` | 400 | `ui-monospace, monospace` | VIN numbers, system identifiers, demo credentials |

### 4.2 Numerical Rule
- All tables, timestamps, coordinate measurements, case ID numbers (`RC-00042`), and counts enforce `font-variant-numeric: tabular-nums`.
- Monospace is preserved **strictly** for inline `<code>` tags (e.g. 17-character VIN strings, API keys, raw equipment serial numbers).

---

## 5. Shape, Borders & Tactile Elevation

### 5.1 Zero-Radius Rule
All interactive elements—buttons, text fields, selects, cards, dialog sheets, table containers, and pagination bars—strictly feature `border-radius: 0`.

*Exceptions:* Strictly circular utility marks:
- Teardrop brand mark (`border-radius: 50% 50% 50% 0`)
- User initials avatar (`border-radius: 50%`)
- Loading spinner (`border-radius: 50%`)
- Toast success checkmark badge (`border-radius: 50%`)

### 5.2 Physical Drop Shadow Matrix

| Component | Box Shadow Specification | Behavior on Hover / Active |
|---|---|---|
| **Primary Action (Signal)** | `5px 5px 0 var(--forest)` | `translate(2px, 2px)` / `3px 3px 0 var(--forest)` |
| **Claim Button** | `3px 3px 0 var(--forest)` | `translate(1px, 1px)` / `2px 2px 0 var(--forest)` |
| **Input / Select Focus** | `4px 4px 0 rgb(23 59 50 / 0.16)` | Replaces default outline on keyboard & focus |
| **Record Count Block** | `5px 5px 0 rgb(23 59 50 / 0.12)` | Static elevated physical tile |
| **Case Register Table** | `8px 8px 0 rgb(23 59 50 / 0.10)` | Framing border with tactile offset shadow |
| **Identity Card** | `10px 10px 0 rgb(23 59 50 / 0.13)` | Deep container elevation |
| **Claim Modal Sheet** | `10px 10px 0 var(--signal)` | High-impact safety orange offset shadow |
| **Toast Alert** | `5px 5px 0 var(--signal)` | Grounded tactile alert overlay |

---

## 6. Component Guidelines

### 6.1 Application Shell & Navigation

- **Sidebar (`.sidebar`):**
  - Desktop: 15rem (`240px`) fixed/sticky sidebar in `--forest` (`#173b32`), divided from the workspace by a bold `4px solid var(--signal)` safety-orange border.
  - Contains the Brand lockup, labeled navigation links (`01 My Cases`, `02 Claimable Cases`, `01 My Profile`), and the user identity tray with user initials avatar, role indicator, and sign-out action.
  - Active navigation state: `border-left: 2px solid var(--signal)` with elevated background tone `rgb(255 255 255 / 0.08)`.
- **Responsive Header (`<900px`):**
  - Automatically collapses into a top sticky bar with horizontal tab navigation.

### 6.2 Buttons & Action Tiers

1. **Primary Action (`.primary-action` / `.button--claim`):**
   - High-visibility safety orange (`var(--signal)`).
   - Solid `--forest` hard drop shadow.
   - Used for "Sign in", "Claim", and "Confirm claim".
2. **Dark Neutral Button (`.button--dark`):**
   - Solid `--forest` surface with white text.
   - Used for "Apply filters", "Open case", and "Try again".
3. **Quiet Button (`.button--quiet`):**
   - Warm parchment surface (`var(--surface)`) with `--line-dark` border.
   - Used for "Clear", "Cancel", and pagination triggers.
4. **Text Action (`.text-action`):**
   - Borderless underline text button with `0.25rem` underline offset for secondary actions (e.g. Sign out).

### 6.3 Form Controls & Input Styling

- **Inputs & Selects:**
  - Minimum height `3.1rem` (`49.6px`) with generous internal padding.
  - Background `var(--surface)`, border `1px solid var(--line-dark)`.
  - Focus state: border shifts to `--forest` accompanied by `4px 4px 0 rgb(23 59 50 / 0.16)` offset shadow.
- **Password Input:**
  - Integrated grid containing right-aligned toggle trigger (`.password-toggle`) allowing users to easily inspect entered credentials.
- **Labels:**
  - Uppercase, bold `0.78rem` labels positioned directly above controls with clear vertical spacing (`0.45rem`).

### 6.4 Data Tables & Case Register

- **Table Layout:** Full-width border-collapse table with strict horizontal rules (`1px solid #dddeda`) and zero vertical borders.
- **Headers (`<th>`):** Uppercase, letter-spaced `0.65rem` typography on neutral stone background (`#eae8e1`).
- **Row Interaction:** Hover state activates warm ivory illumination (`#faf7ee`) with smooth 100ms transition.
- **Vehicle Identity Block (`.vehicle-identity`):**
  - Primary line: License plate in bold headline text.
  - Secondary line: Make and model in subdued tone.
  - Tertiary line: 17-character VIN in monospace `<code>`.
- **Status Badges (`.status-badge`):**
  - Compact border-boxed pills with uppercase text and `0.07em` letter spacing.

### 6.5 Responsive Card Transformation (`.case-cards`)
On screens below 900px, the data table is cleanly hidden and replaced with modular case cards (`.case-card`):
- Standalone article cards with vehicle plate, status badge, two-column metadata definitions (`<dl>`), and full-width touch actions (`min-height: 44px`).

### 6.6 Modals & Dialogs (`.claim-dialog`)
- Implemented using semantic HTML `<dialog>`.
- **Backdrop:** Tactical frosted dark glass (`background: rgb(8 24 19 / 0.72); backdrop-filter: blur(2px)`).
- **Sheet (`.dialog-sheet`):** Solid `var(--surface)` container with high-impact `10px 10px 0 var(--signal)` shadow.
- Dismissible via Backdrop click or Escape key, with defensive prevention during asynchronous claim submission.

### 6.7 Scan History & Location Trail

- **Chronological Timeline (`.scan-entry`):**
  - Left numerical milestone node (`.timeline-marker span`) displaying `01`, `02`, etc., interconnected by a continuous 1px vertical guide rail (`var(--line-dark)`).
- **Scan Card:**
  - Two-column split layout: Left image viewport (`.scan-image`) + Right metadata grid (`.scan-metadata`).
  - **Diagonal Hatch Image Fallback (`.image-fallback`):** When image loading fails or is unavailable, displays an industrial 45° repeating safety hatch pattern with `▧` symbol.
  - **Shared Network Source Privacy Note:** Explicit visual indicator when sighting coordinates originate from a partner agency with redacted equipment details.
- **Location Brief (`.location-brief`):**
  - Sticky right-rail card in solid `--forest` with orange kicker, large tabular GPS coordinates, and direct Google Maps launcher.

### 6.8 Notification Toast (`.toast`)
- Fixed bottom-right toast in `--forest` with safety orange drop shadow (`5px 5px 0 var(--signal)`).
- Features circular checkmark badge (`.toast-mark`) and automated 4.2-second dismissal timer.

---

## 7. Responsive Breakpoints

| Breakpoint | Target Devices | Layout Adaptations |
|---|---|---|
| **> 1100px** | Large Desktop & Workstations | Full 2-column detail layout, 4-column filter bar, expanded table columns |
| **900px – 1100px** | Compact Laptops & Large Tablets | Filter bar reflows to 3 columns, detail layout narrows right rail |
| **680px – 900px** | Tablets | Sidebar collapses to top bar; Data tables transform to interactive `.case-cards` |
| **< 680px** | Mobile Handhelds | Login hero collapses; Hero titles scale down smoothly via `clamp()`; Filter inputs and buttons stack full-width |

---

## 8. Motion & Accessibility Standards

- **Touch & Click Targets:** All interactive buttons, inputs, and links enforce minimum dimensions of `44px × 44px`.
- **Keyboard Navigation:** High-contrast focus outlines using `--focus-ring` (`#f0a388`) with `3px` offset, ensuring focus is always conspicuous.
- **Screen Reader Support:** Screen-reader-only labels (`.sr-only`) on icon actions and table action columns; semantic ARIA alerts on errors and toasts (`role="alert"`, `role="status"`).
- **Prefers-Reduced-Motion:** Built-in media query disabling all transitions, transforms, and spin animations when requested by system accessibility settings:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
