# Product UX Spec — LPR Vehicle Recovery Platform

## 1. Purpose

Design a simple dashboard experience for recovery-agency users to:

1. View their tenant's recovery cases and current status.
2. Open a case and review its scan/location trail.
3. View claimable `pending_claim` cases from across the platform and claim one.

The product should prioritize clarity, speed, and low cognitive load over advanced workflow complexity.

---

## 2. Primary Users

### Staff User
Authenticated operational user belonging to a tenant/recovery agency.

Core actions:
- Review own tenant's cases.
- Open a case to inspect scan history.
- Browse globally claimable pending cases.
- Claim a pending case.

> For the current scope, the user who claims a case becomes the assignee.

Administrators have read-only access to their tenant's cases. Agents collect
scan observations and do not use the case-management workflows.

---

## 3. Core Business Rules

- Tenant-owned data is isolated by tenant.
- Staff and administrators can only open their own tenant's active/closed
  cases. A case trail may include redacted sightings from another tenant.
- `pending_claim` cases are the deliberate exception:
  - visible to staff users from any tenant,
  - claimable only by staff users,
  - only one user/tenant can successfully claim a case.
- On successful claim:
  - `status` becomes `ACTIVE`,
  - `tenant_id` becomes the claiming user's tenant,
  - `assignee_id` becomes the claiming user's user ID.
- Already claimed or closed cases cannot be claimed again.

---

## 4. Suggested Information Architecture

Primary navigation:

- **My Cases**
- **Claimable Cases**

Case details are accessed from **My Cases**.

Keep navigation intentionally minimal for the first version.

---

# 5. Screen Specifications

## 5.1 My Cases

### Goal
Let users quickly understand all recovery cases owned by their tenant.

### Layout
Use a table or clean data-list.

### Recommended Columns
- Case ID
- Vehicle identifier
  - VIN preferred
  - plate may be shown as secondary text
- Status
- Assignee
- Last sighting
- Updated at

### Status Values
- `ACTIVE`
- `CLOSED`

`PENDING_CLAIM` should normally appear under **Claimable Cases**, not My Cases, because it is not tenant-owned yet.

### Interactions
- Entire row or case ID is clickable.
- Clicking opens **Case Detail**.
- Basic status filtering is useful:
  - All
  - Active
  - Closed

### Empty State
> No cases assigned to your agency yet.

---

## 5.2 Case Detail

### Goal
Help the user understand the case and where the target vehicle has previously been observed.

### Header
Show:
- Case ID
- Status badge
- VIN
- Plate
- Assignee
- Last updated

### Main Content: Scan / Location Trail

The scan trail is the primary source of investigation context.

Each scan item should show:
- Timestamp
- Location
- Latitude / longitude if a formatted address is unavailable
- Camera / agency-vehicle reference if useful
- Scan image thumbnail, when available

Example:

```text
Oct 08, 2026 · 18:42
Sector 29, Gurugram
28.4682, 77.0631
[scan image]
```

Sort newest-first by default.

### Map / Heatmap

A map is useful as a **secondary visualization**, not a replacement for the scan list.

Recommended behavior:
- Show all known scan locations for the case.
- Use markers for individual sightings.
- If there are many sightings, support a heatmap view to show repeated/high-density locations.
- Selecting a marker should highlight or reveal the related scan.
- Keep the plain chronological list available at all times.

A heatmap is especially useful when repeated sightings reveal likely parking, residential, work, or travel patterns.

### Empty State
> No historical sightings found for this vehicle yet.

---

## 5.3 Claimable Cases

### Goal
Show all `pending_claim` recovery opportunities that can currently be claimed.

These may originate from cameras belonging to other tenants.

### Layout
Use a table or compact card list.

### Recommended Fields
- Case ID
- Vehicle identifier
  - VIN
  - plate
- Latest known sighting
- Created at
- **Claim** action

Do **not** expose private tenant information about the agency that originally produced the scan unless explicitly required.

### Claim Interaction

Primary action:

**Claim**

Recommended flow:

1. User clicks **Claim**.
2. Show a lightweight confirmation:
   > Claim this recovery case?
3. On success:
   - change status to `ACTIVE`,
   - assign the case to the user's tenant,
   - assign the case to the claiming user,
   - remove it from the Claimable Cases list,
   - optionally navigate to the new Case Detail screen.

### Concurrent Claim Handling

Another user may claim the same case first.

If that happens, show a clear message:

> This case has already been claimed by another user.

Then remove or refresh the stale row.

### Empty State
> No claimable cases are available right now.

---

# 6. Dashboard / Home Experience

A separate dashboard is optional for the first version.

If included, keep it minimal:

### Summary Cards
- Active Cases
- Closed Cases
- Claimable Cases

### Quick Sections
- Recently updated cases
- Recently available claimable cases

Avoid analytics-heavy dashboards until there is a clear business requirement.

---

# 7. UX States

Every major list/detail screen should support:

### Loading
Use table/list skeletons.

### Empty
Provide a short, contextual empty-state message.

### Error
Keep errors actionable and concise.

Examples:
- `Unable to load cases. Try again.`
- `Unable to load scan history.`
- `This case has already been claimed.`

### Success
For claim success:

> Case claimed successfully.

---

# 8. Visual Guidance

- Operational B2B dashboard style.
- Prefer dense but readable layouts.
- Use status badges consistently.
- Keep `Claim` visually prominent as the primary action on pending cases.
- Avoid decorative UI that reduces scanability.
- Use cards sparingly; prefer tables/lists for data-heavy screens.
- Keep map/heatmap visually secondary to case information.

Suggested status treatment:
- Pending Claim — neutral / attention
- Active — prominent
- Closed — muted

---

# 9. Suggested Screen Flow

```text
Login
  |
  +--> My Cases
  |      |
  |      +--> Case Detail
  |              |
  |              +--> Scan Trail
  |              +--> Map / Heatmap
  |
  +--> Claimable Cases
         |
         +--> Claim
                |
                +--> Case becomes ACTIVE
                       |
                       +--> Case Detail
```

---

# 10. Out of Scope for This Version

Do not design these unless later requested:

- Creating/editing tenants
- User-management workflows
- Agency-vehicle management
- Camera provisioning/configuration
- Lender/partner-network UI
- Manual case creation
- Case reassignment
- Separate claimant vs assignee workflow
- Route optimization
- Dispatch planning
- Messaging/chat
- Advanced reporting/analytics
- Billing
- Cross-tenant scan browsing
- Complex role/permission-management UI

---

# 11. Design Principle

The product should feel like an operational recovery tool, not a generic admin dashboard.

The primary questions the UI should answer are:

1. **What cases does my agency own?**
2. **Where has this vehicle been seen?**
3. **What new recovery opportunities can I claim right now?**

Anything that does not directly help answer one of these questions should be considered secondary for the first version.
