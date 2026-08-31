# Agent Note: Community-reported bug batch (discussions 5172/5146/5163/5147)

Status: implemented

English | [中文](2026-08-31-community-bug-batch.zh.md)

## Problem

Four community bug reports from GitHub Discussions, triaged against current master with each reporter's root cause verified before fixing:

- **#5172** — `plugin-package-inventory-deepseek` throws `cannot resolve active package` for every bundle dependency invisible from its anchor search chains in a source-checkout host, failing the entire official DeepSeek route on every request. One telemetry field took down the route it serves.
- **#5146** — third-party Typert Remote methods returned HTTP 404 because rc.2's module-private WeakMap marker table split across the two protocol copies a source host loads. **Already fixed upstream**: master stores markers as a prototype own property, which every copy reads identically; only the regression test was missing.
- **#5163** — `popupSelect` never returned keyboard focus to the composer: the headless controller and the view both called `focusComposer()`, but `CommandUiRuntime.bindComposerFocus` had no caller — the service-side hook existed, the client wiring never bound it.
- **#5147** — changing the approval policy to `never` while an ask was pending left the agent stuck "working": `setPolicy` logged the switch but never adjudicated in-flight asks parked on the `approval/request` waterfall.

## Decision

- **#5172**: degrade, don't fail. `PackageIdentityResolver` now caches an unresolvable bare package as an absence and warns once per package per process through the plugin logger (the resolver's existing cache already carried absences; the warning dedup rides a second set). The malformed-manifest throw stays — that row resolved a real file whose content is wrong.
- **#5146**: no code change. The cross-copy fixture (`tests/fixtures/cross-copy-markers.ts`) loads `lib/index.js` and `src/index.ts` as two module instances in one process and asserts markers written through one are readable through the other, locking the property-based design against a WeakMap regression.
- **#5163**: wire the existing hook, don't add a channel. `InputHub.shellFor` binds `commandUi.bindComposerFocus(id, () => shell.focusComposer())` when the service is present (unbind rides the scope disposer), and `SessionInputShell.focusComposer()` pairs the root element's DOM focus with Lexical's selection restore — the same pairing the unlock effect uses, minus the reveal. The dependency direction stays: ui-conversation's hub already duck-types `commandUi` structurally.
- **#5147**: adjudicate pending asks at the policy switch, keyed by the asking agent. `request()` registers each ask's resolver (`arm`/`settlePending`); `setPolicy('never')` settles that agent's pending asks as `rejected` — the same verdict an ask starting under `never` receives — so the awaiting tool call resolves and the turn closes. The reporter's one-line `agent.signal.abort()` was rejected: that signal is the turn-lifecycle abort and would cancel the agent, not the ask. Returning to `ask` leaves in-flight asks standing (their prompts stay actionable); `signal` aborts keep their existing `'cancelled'` race.

## Consequences

A source-checkout host keeps its official DeepSeek route when workspace-only packages are invisible to the inventory resolver (one warning per package, the field omits the row). The 404 class cannot return without failing the cross-copy test. `/model` and every popupSelect command return focus to the composer on pick and Escape. A policy switch to `never` no longer strands a turn: the pending tool call receives `rejected` with its audit pair closed (`approval/decided` with `outcome: rejected`).

## Alternatives considered

- **#5172**: adding the bundle package directory to the anchors — patches one layout, not the class; the degrade is the fix, the anchor widening a possible follow-up upstream.
- **#5147**: aborting `agent.signal` (the report's suggestion) — kills the agent turn instead of answering the ask; settling through the pending registry matches the `never`-at-entry verdict already documented.
