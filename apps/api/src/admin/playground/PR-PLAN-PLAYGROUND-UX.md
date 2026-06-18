# Playground UI PR Plan

This plan captures the agreed implementation path for improving the admin playground response workflow. The work is intentionally split into two PRs:

1. Prep cleanup PR: move playground styling out of inline styles and into a shared CSS/component structure, preserving behavior.
2. Response history/docking PR: implement persisted response history, request docking, and history browsing on top of that cleaner UI base.

## PR 1: Playground CSS And Component Cleanup

### Goals

- Extract playground styling from inline `style` props into global playground CSS.
- Move the inline controller `<style>` block into built playground CSS.
- Add thin shared UI components so existing and future playground UI is consistent.
- Preserve current behavior, except for the small agreed Images-tab anchor fix.

### Non-Goals

- Do not implement response history.
- Do not implement request docking or resizing.
- Do not change request/response data flow.
- Do not refactor live session/recorder behavior.

### Files And Structure

- Add `apps/api/src/admin/playground/client/playground.css`.
- Add `apps/api/src/admin/playground/build.ts`.
- Update `apps/api/package.json` `build:playground` to call `tsx src/admin/playground/build.ts`.
- Update `apps/api/src/admin/playground/controller.ts` to read generated JS and CSS from `dist`, then inline both into the served HTML.
- Add shared thin UI wrappers under `apps/api/src/admin/playground/client/components/ui/`, likely:
  - `Button.tsx`
  - `Panel.tsx`
  - `Tabs.tsx`
  - `Field.tsx`
  - `EmptyState.tsx`
  - `Section.tsx`

### Styling Direction

- Use semantic CSS class names and `data-*` variant attributes instead of inline styles.
- Define shared classes for:
  - page shell/layout
  - panels and panel labels
  - nav tabs
  - buttons and button variants
  - fields, labels, textareas, selects
  - tabs and tab separators
  - empty states
  - chips/pills
  - response media grids
  - warning/error surfaces
- Keep the existing dark admin-tool visual language.
- Use compact spacing and simple bordered rows/panels.
- Avoid introducing a complex design system API; wrappers should stay thin.

### Component Extraction Scope

- Extract obvious shared/reusable UI pieces.
- Remove inline styles broadly across playground client components, including:
  - `App.tsx`
  - `Header.tsx`
  - `FeatureNav.tsx`
  - `RequestBuilder.tsx`
  - scrape request subcomponents
  - `ResponsePane.tsx`
  - `SuccessView.tsx`
  - `ErrorView.tsx`
  - `WarningList.tsx`
  - `StatusPill.tsx`
  - `JsonView.tsx`
  - `JsonEditor.tsx`
  - `LiveView.tsx`
  - `RecorderPanel.tsx`
  - `DiagnosticsWaterfall.tsx`
- Do not explode large feature components like `ScrapeRequestBuilder` or `FormatsPanel` into many domain-specific files in this prep PR.

### Behavior Fix Included

- In `SuccessView` Images tab, normalize both `<img src>` and anchor `href` through `toImageSrc`.
- This preserves “open image in new tab” for raw base64 image values.

### Verification

- Run `pnpm --dir apps/api build:playground`.
- Run `pnpm --dir apps/api build:nosentry`.
- Manual smoke check the playground visually if a local server is already running or easy to start.
- No new broad behavior tests required for this prep PR unless component extraction creates a specific risk.

## PR 2: Response History, Docking, And Persistence

### Goals

- Replace the single-response UI with response history.
- Keep every response as a history entry.
- Persist completed responses to `localStorage` within a 4 MB budget.
- Support feature-specific response lists and a global History tab.
- Add request panel docking/hiding/resizing.
- Let users inspect prior responses, compare multiple open entries, see credits at row level, and restore prior requests.

### Navigation Model

- Add `activeView: Feature | "history"`.
- Keep `activeFeature` as the last selected request feature for request/live/session context.
- Clicking a feature sets both `activeView` and `activeFeature`.
- Clicking `History` sets only `activeView = "history"`.
- The `History` peer tab is right-aligned in the existing top nav.
- Persist active view across reloads, including `History`.

### Response History State

- Remove the existing single `response` signal from playground client state.
- Keep `inflight` for global one-request-at-a-time behavior.
- Add a persistence/history module using Preact signals.
- Store entries globally, sorted newest-first.
- Feature tabs show entries filtered by feature.
- Global History shows all entries.

Suggested entry fields:

```ts
type PlaygroundResponseEntry = {
  id: string;
  feature: Feature;
  method: "POST" | string;
  endpoint: string;
  requestBody: Record<string, unknown>;
  target: string;
  status: number | null;
  body?: Record<string, unknown>;
  errorMessage?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  creditsUsed?: number;
  warningCount: number;
  code?: string;
  pending: boolean;
  persisted: boolean;
};
```

IDs should be timestamp plus crypto-random suffix. Do not deduplicate repeated requests.

### Pending Entries

- Add a pending entry immediately when a request starts.
- Pending entries appear at the top of the active feature list and global History.
- Pending entries are memory-only and are not persisted.
- Pending entries survive feature tab switches.
- Pending entries show `Sending`, target, start timestamp, and live elapsed duration.
- Pending entries show `Request | Response`; Response content says `Sending...`.
- Do not pre-render expected scrape format tabs while pending.
- Do not allow individual delete for pending entries.
- `Clear history` should not kill an in-flight request. It clears completed entries and leaves pending entries visible; pending completion creates the newest completed entry.

### Completion And Error Handling

- On completion, update the pending entry with final status, parsed body, duration, credits, warnings, and code.
- Measure duration as client-side wall time.
- Read response with `await res.text()`, then `JSON.parse`.
- On JSON parse failure, store `status`, `errorMessage`, and up to a 2 KB raw text snippet.
- Network/client errors use `status: 0` plus `errorMessage`.
- `StatusPill` should support status `0` as `Network error`/`Error`.

### Persistence

- Use a versioned localStorage schema key, e.g. `firecrawl.playground.responseHistory.v1`.
- Unknown or invalid saved history is silently discarded.
- Do not store `apiKey` or `Authorization` header generated from the playground API key.
- Store request bodies exactly, including user-provided headers/cookies if present.
- Store response bodies exactly as parsed JSON.
- Persist UI state with history:
  - open/closed state per response ID
  - active tab per response ID
- Persist only completed entries.
- Use a 4 MB serialized budget for persisted response history.
- If entries cannot fit, mark affected visible entries as `not saved` but keep them in current memory.
- A single oversized new entry remains visible/open and marked `not saved`.
- `not saved` entries behave like normal current-session entries except they disappear on reload.
- Per-entry `not saved` tag is enough; no global persistence warning.
- Catch localStorage write/quota errors and mark affected entries `not saved`.
- Debounce persistence for UI state churn by about 100-250 ms, but save immediately after completion/delete/clear.

### History Helpers And Tests

Expose pure helpers from the history module for focused Vitest coverage:

- `deriveTarget`
- `extractCreditsUsed`
- `normalizeWarnings`
- `normalizeHistory`
- `serializePersistedHistory`
- `applyPersistenceBudget`
- request restore helper/data selection as appropriate

Add tests next to playground client code, not under global snips:

- `apps/api/src/admin/playground/client/history.test.ts`
- `apps/api/src/admin/playground/client/components/ResponseHistory.test.tsx` if useful

Testing decisions:

- Use Vitest.
- Use injected storage adapter for pure persistence tests.
- Use `// @vitest-environment jsdom` only for DOM smoke tests.
- Avoid adding Testing Library for now; render Preact directly into `document.createElement("div")`.

Test coverage should include:

- appending pending entries
- completing entries
- newest-first ordering
- target derivation
- credits extraction
- warning count normalization
- localStorage hydrate/discard
- 4 MB budget and `not saved` behavior
- delete and clear history
- restore request data
- one lightweight DOM/header behavior test

### Credits Extraction

Use explicit known shapes first with a narrow array fallback:

1. `body.data.metadata.creditsUsed`
2. `body.metadata.creditsUsed`
3. `body.creditsUsed`
4. If `body.data` is an array and every item has numeric `metadata.creditsUsed`, sum them.

Do not arbitrary-deep-search for `creditsUsed`.

Display:

- Numeric `0` displays as `0 credits`.
- Missing credits displays as muted `- credits`.
- Totals include any numeric credits regardless of success/failure.
- Pending entries do not count as unknown.
- Unknown count includes only completed entries with no numeric credits.
- Memory-only entries count in totals while visible in the current session.

### Target Derivation

Derive from the submitted request body:

- `scrape`, `map`, `crawl`: `url`
- `search`: `query`
- `extract`: first URL plus count, e.g. `example.com +2`
- `agent`: `startUrl`, otherwise first 60 chars of `agentPrompt`
- fallback: endpoint

Normalize display targets only:

- strip URL protocol
- strip trailing slash
- truncate visually with CSS ellipsis
- keep full display target in `title`
- keep exact request body in storage

Do not prefer response metadata source URL for row headers; the row represents what was requested.

### Warning Handling

- Store normalized warning metadata on entries for row rendering.
- Row warning count priority:
  - if `warnings[]` exists, use `warnings.length`
  - otherwise if legacy `warning` exists, use `1`
  - do not double-count both
- Expanded response content should still render both structured warnings and legacy warning summary using existing behavior.
- Warning count appears only for completed entries.

### Response Entry UI

- Each response is an accordion/dropdown row.
- Multiple entries can be open at once.
- Newest response auto-opens at the top.
- Previously open entries remain open.
- Open/closed state is shared per response across feature tabs and global History.
- Active inner tab is persisted per response and shared across views.
- If a saved active tab no longer exists, fall back safely.

Header contents:

- colored status pill
- feature label only in global History
- target
- completion timestamp for completed entries, start timestamp for pending entries
- duration
- credits used
- API error code when available
- compact warning count/tag when warnings exist
- `not saved` tag when relevant

Header behavior:

- whole row toggles open
- `aria-expanded` and `aria-controls`
- Enter/Space toggles
- action buttons stop propagation
- target uses CSS ellipsis
- status + target remain stable; secondary chips may wrap on narrow widths

### Tabs Inside Entries

- `Request` is always first, then a separator, then response tabs.
- New entries auto-select the first available response data tab, not `Request`.
- Scrape entries reuse existing response tabs:
  - `markdown`
  - `html`
  - `rawHtml`
  - `screenshot`
  - `json`
  - `extract`
  - `links`
  - `images`
  - `summary`
  - `answer`
  - `highlights`
  - `changeTracking`
  - `attributes`
  - `branding`
  - `audio`
  - `video`
  - `actions`
  - `meta`
  - `diagnostics`
- Non-scrape entries get minimal tabs:
  - `request`
  - `response`
  - warnings tab only if needed by final render design
- Refactor `SuccessView` so scrape tab state can be controlled by entry active-tab state.
- Keep existing special job-id display for `crawl` and `agent` inside the `response` tab.

Request tab:

- Shows `METHOD endpoint`, e.g. `POST /v2/scrape`.
- Shows exact request body with `JsonView`.
- Contains a normal text button: `Restore request`.
- No confirmation before restore.
- Restore does not send automatically.

Restore behavior:

- Available in feature-specific lists and global History.
- From History, switch both `activeView` and `activeFeature` to the entry feature.
- Update only that feature's draft request body.
- Leave other feature drafts untouched.
- If request panel is hidden, unhide to last visible dock side.
- If visible, flash/focus the request panel.
- Do not restore raw/form UI mode; only request body data.

### Request Drafts

- Replace one global `requestBody` with per-feature draft bodies.
- Preserve each feature's draft independently.
- Persist feature draft bodies to localStorage.
- Persist only valid request bodies, not invalid raw JSON text.
- Generic non-scrape builders should read/write shared request-body signals directly like the scrape builder.
- Restore must update visible fields in all builders.

### Feature And History Lists

Feature tabs:

- Show all saved/current responses for that feature, newest-first.
- Header label: `Responses (N) | N credits | M unknown`.
- Feature label is hidden inside row headers because the tab already scopes it.
- Empty state: `No scrape responses yet`, etc.

Global History tab:

- Peer nav tab, right-aligned.
- Full-width history browser.
- No request controls.
- No Live view/Actions lower panels.
- Shows all entries newest-first.
- Header label: `History (N) | N credits | M unknown`.
- Includes `Clear history` action on the right.
- No filters in first implementation.
- Empty state: `No saved responses yet`.

### Delete And Clear

Individual delete:

- Available anywhere completed entries appear.
- Deleting from a feature tab removes the same record from global History.
- Delete `x` appears on hover/focus on desktop.
- Delete `x` is always visible on coarse pointer/touch.
- Pending entries do not show delete.
- Use a small custom confirmation modal.
- Modal shows target and timestamp.
- Backdrop click cancels.
- Escape cancels.
- Minimal focus trap.

Clear history:

- Only in global History toolbar.
- Uses the same custom confirmation modal style.
- Clears completed persisted and memory-only entries.
- Leaves pending entries in flight and visible.
- Does not touch request drafts.
- Does not touch layout preferences.
- Confirmation copy should mention request drafts/layout settings stay.
- If there is a pending request, confirmation copy should mention pending requests stay and complete normally.

### Request Docking And Layout

Workspace toolbar:

- Lives above the request/response workspace grid.
- Controls `Left`, `Right`, `Hide`.
- Includes low-emphasis reset-width control.
- Persists `requestDockMode`.
- Persists `lastVisibleDockMode`, defaulting to `left`.
- Persists rail width.

Desktop behavior:

- Default dock side: `Left`.
- Request panel is a responsive rail.
- Initial rail width around `420px`.
- Draggable width:
  - min `320px`
  - max `min(680px, 55vw)`
- One shared width for left and right.
- Show resize handle only when request panel is visible.
- Live update while dragging; persist on pointerup.
- `Hide` gives responses full width.
- Restore while hidden reopens to `lastVisibleDockMode`.

Mobile/narrow behavior:

- Collapse dock controls to `Show/Hide request`.
- Ignore saved rail width and stack full-width.
- Preserve desktop dock side behind the scenes.

Lower row:

- Keep Live view/Actions below normal feature tabs.
- Hide Live view/Actions on global History tab.
- Hiding request panel affects only the top workspace, not the lower row.

### Accessibility

- Accordion headers are keyboard-toggleable with Enter/Space.
- Accordion headers expose `aria-expanded` and `aria-controls`.
- Delete modal supports Escape to close.
- Delete modal has a simple focus trap.
- Backdrop click cancels deletion.
- Touch users can see delete controls without hover.

### Verification

- Run targeted Vitest tests for new playground history modules/components.
- Run `pnpm --dir apps/api build:playground`.
- Run `pnpm --dir apps/api build:nosentry`.
- Manual browser checks:
  - feature-specific response lists
  - global History tab
  - pending entry flow
  - completion flow
  - request restore from feature and History
  - localStorage reload
  - 4 MB/not-saved behavior with large screenshot response
  - delete and clear modals
  - left/right/hide docking
  - drag resize
  - mobile stacked layout
