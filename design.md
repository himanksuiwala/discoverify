# LPR Vehicle Recovery — Interface Design System

**Version:** 1.0 · **Status:** Design direction for implementation  
**Applies to:** My Cases, Case Detail, Claimable Cases, scan/location trail, map/heatmap views, and supporting operational states  
**Product behavior:** [Product UX specification](PRODUCT_UX_SPEC.md)

## 1. Design intent

This is an operational tool for vehicle-recovery agency staff working with active recovery cases, historical LPR sightings, and newly claimable recovery opportunities. The interface should feel calm, precise, and efficient: clear hierarchy, compact but readable controls, restrained surfaces, and strong context around case status, vehicle identity, and location intelligence.

A user should be able to answer three questions quickly:

1. What cases does my agency currently own?
2. Where has a target vehicle been seen?
3. What new recovery opportunities are available to claim?

**Visual character:** Inter typography, a Tailwind Neutral foundation, small semantic status accents, Phosphor icons, low visual noise, and consistent component behavior. Use whitespace and alignment to establish hierarchy before adding borders, shadows, or color. Reserve emphasis for vehicle identity, case status, the primary action, recent sightings, and exceptions requiring attention.

The system is desktop-first because its main tasks involve dense operational tables, case details, and location history. Tablet and mobile layouts remain usable for search, inspection, and claiming cases. No screen should rely on a wide viewport to reveal essential case or location context.

---

## 2. Technology and component ownership

The frontend is React 19, Vite, and Tailwind CSS 4. Its original shadcn setup uses `radix-nova`, `neutral`, CSS variables, and a Lucide generator setting. New and migrated product UI should use Coss components, Inter, and Phosphor while allowing older unused shadcn files to remain during incremental migration.

**Component rule:** Use shadcn's current CLI and local `components/ui` files as the component delivery mechanism. For a new pattern offered by Coss UI, prefer its component and neutral token system. Keep a shadcn component where it already works or where Coss does not provide the needed pattern.

Wrap product-specific behavior in `components/product` so recovery business rules do not get embedded in registry files. Add only components needed by an implemented screen; avoid installing all primitives by default.

Coss UI uses Base UI; existing shadcn components use Radix. They can coexist at the app level, but an individual dialog, menu, combobox, or other composite control must use one library's parts throughout. Coss triggers commonly use `render` where Radix compositions use `asChild`, and Coss often names overlay content `Popup` or `Panel`. Review component diffs before replacing customized files.

| Product need | Preferred source | Product-level composition |
|---|---|---|
| Navigation, actions, cards, status badges | Coss Button, Card, Badge, Breadcrumb, Tabs, Menu, Sheet | App shell, case header, claim action |
| Search and filters | Coss Input, Combobox, Select, Popover, Date Picker | Case list and claimable-case filters |
| Case and scan tables | Coss Table, Pagination, Skeleton, Empty | Tenant case list, pending-claim list, scan trail |
| Feedback and confirmations | Coss Alert, Dialog, Toast | Claim confirmation, stale-claim conflict, load errors |
| Location visualization | Map library + local product wrappers | Scan markers, optional heatmap, selected-sighting detail |
| Domain-specific displays | Local components | Vehicle identity, CaseStatus, ScanLocation, SightingTime |

Charts are not a primary product primitive for this scope. The map/heatmap is a secondary visualization; exact scan details must remain available in a list/table.

---

## 3. Typography

Use **Inter Variable** for body, headings, controls, tables, and metrics. Self-host with `@fontsource-variable/inter`; map `--font-sans` and `--font-heading` to Inter.

| Role | Size / line height | Weight | Use |
|---|---|---:|---|
| Page title | 28 / 36 px | 600 | My Cases, Claimable Cases, case destination |
| Section title | 18 / 26 px | 600 | Vehicle summary, scan history, location trail |
| Large metric | 26 / 32 px | 600 | Optional overview counts |
| Important identity | 20 / 28 px | 600 | VIN or primary plate in case header |
| Body and form value | 15 / 22 px | 400 | Default reading and controls |
| Table value | 14 / 20 px | 400–500 | Dense rows, never below 14 px |
| Label and helper | 13 / 18 px | 500 / 400 | Status, timestamps, metadata |

- Keep prose blocks near 65 characters per line; left-align text.
- Use sentence case for navigation, controls, headings, table headers, and state names.
- Reserve uppercase for compact domain codes where appropriate.
- Use `font-variant-numeric: tabular-nums lining-nums` for timestamps, counts, coordinates, and numeric table columns.
- VINs, plates, timestamps, and coordinates should remain visually unambiguous and easy to scan.
- Do not truncate VINs without an accessible way to reveal the full value.

---

## 4. Color and elevation

Use the Tailwind Neutral palette through semantic CSS variables. Do not scatter raw color values across components. Preserve the existing neutral/CSS-variable conventions. If Coss UI is added, define semantic `info`, `success`, `warning`, and `destructive` tokens for both light and dark themes.

| CSS token | Light value | Dark value | Typical use |
|---|---|---|---|
| `--background` | white | neutral-950 | Main canvas |
| `--card`, `--popover` | white | neutral-900 | Summaries, popovers |
| `--muted`, `--sidebar` | neutral-50 | neutral-900 | Sidebar, filter row, quiet grouping |
| `--foreground` | neutral-900 | neutral-50 | Headings, values |
| `--muted-foreground` | neutral-600 | neutral-400 | Labels, helper copy |
| `--border`, `--input` | neutral-200 | neutral-800 | Table rules, fields |
| `--primary` / `--primary-foreground` | neutral-900 / white | neutral-100 / neutral-950 | Claim and primary actions |
| `--ring` | neutral-700 | neutral-300 | Keyboard focus with offset |

Neutral is the visual default. Use semantic color only for state and feedback.

Suggested status treatment:
- `PENDING_CLAIM`: warning/attention treatment
- `ACTIVE`: info or success-adjacent treatment
- `CLOSED`: muted/neutral treatment
- Claim conflict or failure: destructive treatment

A state always includes a text label; color must never be the only signal.

Use 1 px dividers for tables and section boundaries, subtle card borders, and minimal shadows only for elevated overlays. Avoid gradients, saturated hero panels, and nested card grids.

---

## 5. Spacing, shape, and responsive grid

- Base spacing unit: **4 px**. Main rhythm: 8, 12, 16, 24, 32, and 48 px.
- Radius: 8 px for controls and small panels, 10 px for cards, 12 px for overlays.
- Desktop shell: 232 px sidebar, 64 px top bar, content width up to 1,440 px, 32 px page padding.
- Tablet: collapsible sidebar and 24 px page padding.
- Mobile: navigation in a labeled sheet, 16 px page padding, one-column content.
- Dense desktop table rows target 40–44 px.
- On touch screens, interactive targets are at least 44 × 44 px.
- In horizontally scrollable tables, keep the primary vehicle/case identity column visible where possible.

---

## 6. Phosphor icon rules

Use the official `@phosphor-icons/react` package as the only product icon family. Regular weight is the default; filled weight may mark a selected navigation item or completed state.

Keep icons at:
- 20 px in navigation
- 16–18 px beside inline text
- 24 px in empty states

Use `currentColor` so icons inherit semantic text color.

| Context | Icon meaning | Text remains visible |
|---|---|---|
| My Cases / Claimable Cases | Destination recognition | Navigation label |
| Search / Filter | Input affordance | Label or accessible name |
| Vehicle / Camera / Location | Context cue | Domain label or value |
| Pending / Active / Closed | Case state | Full state word |
| Warning / Error / Success | Outcome | Message and recovery path |
| Map / List | View mode | View label or tooltip |

Decorative icons use `aria-hidden="true"`. Icon-only actions need an accessible name, tooltip, and sufficient hit area.

---

## 7. Shared interaction patterns

### Actions

- One primary action per area.
- On Claimable Cases, **Claim** is the primary row/card action.
- Use neutral outline/ghost actions for Back, Cancel, Close, and secondary operations.
- Claim confirmation should be lightweight and explicit:
  - identify the case,
  - identify the target vehicle,
  - confirm that claiming assigns the case to the current user's tenant and to the current user.
- Do not introduce a separate claimant-to-agent reassignment workflow in this version.

### Tables and filters

- Keep filters immediately above the data they affect.
- Show active filter chips when filters are applied.
- Header labels remain short and sentence case.
- Use thin horizontal rules rather than full cell boxes.
- Row hover and keyboard focus must be distinct.
- Entire case rows may be clickable when the click target is unambiguous.
- At mobile widths, convert dense rows to stacked records with the most important information first:
  - Case ID
  - VIN / plate
  - status
  - latest sighting
  - primary action

### States and feedback

- Stable case states are `PENDING_CLAIM`, `ACTIVE`, and `CLOSED`.
- `PENDING_CLAIM` belongs in the claimable-case experience, not the tenant-owned My Cases list.
- Loading skeletons should reflect actual content shape.
- Empty states name what is missing and what the user can do next.
- A service error states what failed and offers Retry where appropriate.
- Toasts confirm transient outcomes, but durable state changes must also be visible in the page.

Examples:
- `Case claimed successfully.`
- `This case has already been claimed by another user.`
- `Unable to load scan history. Try again.`
- `No historical sightings found for this vehicle.`

---

## 8. Screen composition

| Screen | Layout and emphasis | Key controls and states |
|---|---|---|
| My Cases | Page title, compact filters, full-width tenant case table | Status filter, row navigation, Active/Closed badges |
| Case Detail | Vehicle/case header, scan trail as primary content, map/heatmap as secondary visualization | Latest sighting, chronological scans, map/list interaction |
| Claimable Cases | Full-width table or compact list of platform-wide `PENDING_CLAIM` cases | Claim action, stale-claim conflict, empty state |
| Optional Overview | 2–3 compact operational metrics plus recent cases | Active case count, claimable count, recent updates |

### My Cases

Show only cases owned by the current tenant.

Recommended columns:
- Case ID
- VIN
- plate
- status
- assignee
- last sighting
- updated at

Default filters:
- All
- Active
- Closed

### Case Detail

Header:
- Case ID
- status
- VIN
- plate
- assignee
- last updated

Primary content:
- chronological scan/location trail
- newest-first by default
- each sighting shows timestamp, location, optional image thumbnail, and camera/agency-vehicle reference when useful

Secondary content:
- map with scan markers
- optional heatmap for dense/repeated sightings
- selecting a marker should reveal or highlight the related scan entry

The list remains the source of truth. The map is a supporting visualization.

### Claimable Cases

Show all currently claimable `PENDING_CLAIM` cases, including cases that originated from another tenant's camera.

Recommended fields:
- Case ID
- VIN
- plate
- latest known sighting
- created at
- Claim action

Do not expose private information about the tenant whose camera originally observed the vehicle unless a later requirement explicitly asks for it.

On successful claim:
- status becomes `ACTIVE`
- `tenant_id` becomes the current user's tenant
- `assignee_id` becomes the current user's ID
- the case disappears from Claimable Cases
- optionally navigate to the Case Detail screen

If another user claims the same case first, refresh/remove the stale item and show a clear conflict message.

---

## 9. Location intelligence and map display

Location history should read as operational evidence, not decorative mapping.

### Scan trail

Every scan item should make these details easy to inspect:
- timestamp
- formatted location when available
- latitude / longitude as fallback
- scan image when available
- camera reference if operationally useful

### Map

The map should:
- plot known sightings for the current case,
- visually distinguish a selected sighting,
- keep markers readable at common zoom levels,
- cluster markers when density becomes high,
- allow a heatmap layer when repeated sightings create useful patterns.

The map must never be the only way to access scan data. All sightings remain available in the list.

### Heatmap

Use a heatmap only when multiple sightings make density meaningful. It is intended to help users spot repeated locations or movement patterns, not to imply certainty about where the vehicle currently is.

---

## 10. Core business rules reflected in UX

### Tenant isolation

Tenant-owned resources remain isolated.

Users must not be given UI affordances to browse another tenant's:
- active/closed cases,
- cameras,
- agency vehicles,
- scans,
- staff.

### Claimable-case exception

`PENDING_CLAIM` cases are the deliberate exception to normal tenant isolation.

Any authenticated user can view and attempt to claim them.

A successful claim:
1. assigns the case to the claimant's tenant,
2. assigns the case to the claiming user,
3. changes status to `ACTIVE`,
4. removes the case from the shared claimable pool.

Exactly one tenant/user can win the claim.

### Scan ownership

Scans are historical observations and remain independent of case ownership.

A case can use matching historical scan data to build its location trail, but the UI should not imply that every scan was created specifically for that case.

---

## 11. Motion and accessibility

- Keep transitions brief: about 120–180 ms for hover/focus and 180–240 ms for overlays.
- Respect `prefers-reduced-motion`.
- Meet WCAG 2.2 AA for contrast, keyboard operation, focus visibility, labels, and error announcement.
- Preserve logical heading and tab order.
- Opening a dialog/sheet moves focus into it; closing restores focus to its trigger.
- Do not use color alone for case status or claim outcomes.
- Map interactions must have list-based equivalents so users are not forced to interact with a map to inspect sighting data.

---

## 12. Implementation handoff

1. Establish the token layer in `frontend/src/index.css`: Inter font mapping, Neutral semantic colors, radius, and Coss semantic status tokens.
2. Replace Lucide icons in product components with Phosphor as screens are migrated.
3. Keep existing shadcn components until a screen is migrated. For each migrated pattern, choose one component owner and verify keyboard/focus behavior.
4. Build product-level primitives first:
   - `AppShell`
   - `PageHeader`
   - `CaseStatus`
   - `VehicleIdentity`
   - `ScanLocation`
   - `SightingTime`
   - `EmptyState`
   - `ErrorState`
   - `FilterBar`
   - `ClaimCaseDialog`
   - `ScanTrail`
   - `CaseMap`
5. Implement screens in this order:
   - My Cases
   - Case Detail
   - Claimable Cases
   - optional Overview
6. Connect screens only after authentication and tenant-scope checks exist in the backend.
7. Test:
   - desktop, tablet, mobile
   - keyboard-only navigation
   - loading, empty, error, and stale-claim states
   - long VINs/plates
   - large scan histories
   - map unavailable/failure fallback
   - simultaneous claim attempts

---

## 13. Out of scope

Do not design or imply these workflows unless later requirements add them:

- tenant administration
- user-management flows
- agency-vehicle CRUD screens
- camera provisioning/configuration
- lender/partner-network management UI
- manual case creation
- case reassignment
- separate claimant and assignee workflows
- route optimization
- dispatch planning
- messaging/chat
- billing
- cross-tenant scan browsing
- advanced analytics/reporting

---

## 14. Design principle

This should feel like a focused recovery-operations tool, not a generic admin dashboard.

Every major UI element should help answer one of these:

- **What cases does my agency own?**
- **Where has this vehicle been seen?**
- **What recovery opportunities can I claim right now?**

Anything outside those questions is secondary for the first version.
