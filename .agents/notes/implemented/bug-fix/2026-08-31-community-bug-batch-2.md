# Agent Note: Second community defect batch (P2/P6/P7/P8/P10)

Status: implemented

English | [中文](2026-08-31-community-bug-batch-2.zh.md)

## Problem

Five more findings from the community health audit (the "发版体检" series), triaged for a single-operator Windows source-checkout deployment that plans to run multiple dsh instances:

- **P2** — a UTF-8 BOM in a profile's `package.json` (Windows Notepad still emits one) crashed boot with a bare `JSON.parse` SyntaxError; YAML patch layers were unaffected (js-yaml tolerates the BOM).
- **P6** — the subprocess env scrub's substring heuristic (`/KEY|PASSWORD|SECRET|TOKEN/i`) silently dropped non-credential names like `AWS_ACCESS_KEY_ID` or `MY_SERVICE_KEY` from every child with no trace.
- **P7** — `@openai/codex` resolution ran at module top level in `subagent-codex/run.ts`: a damaged install failed every importer with a bare resolution stack instead of one actionable sentence.
- **P8** *(claimed)* — a provider `stream()` preflight throw (DeepSeek `UNSUPPORTED_CONTENT`) left an orphan half-turn.
- **P10** — `commitRepair` in the jsonl backend (the default) truncated a torn tail with no staleness re-check, while the sqlite sibling held the same operation inside `begin-immediate` with three staleness throws; a second writer appending in the check-to-truncate window lost its committed bytes.

## Decision

- **P2**: strip a leading U+FEFF in `readProfileManifest` before parsing. The other three bare `JSON.parse(readFileSync)` sites stay: one already tolerates failure (`readModuleProxyRecord`), two read package-manager-written files that never carry a BOM.
- **P6**: keep the scrub (the credential-leak safety intent is right; explicit `env` remains the deliberate-forwarding path) but make it observable: `scrubbedParentEnv({ warn })` reports each dropped credential-shaped name once per process (names only, never values); `DSH_*` removal stays silent as documented behavior. `LocalSubprocessRuntime` wires the sink to its logger at all three `childEnv` call sites (spawn internals carry it through `SpawnInternals.warnScrubbed`).
- **P7**: resolve lazily per call. `codexAppServerArgv(packageName?)` throws one remediation sentence ("install @openai/codex … dsh plugin …") on resolution failure; the parameter exists so tests probe a nonexistent package without touching the real install.
- **P8**: **not reproduced — the claim does not hold on master.** `agent-loop`'s catch/finally pair unconditionally appends `turn/end {kind:'error'}` after a `stream()` throw; the regression test pins this (error kind, `UNSUPPORTED_CONTENT` code preserved, turn/event pairing balanced).
- **P10**: the torn marker now carries `snapshotBytes` (total file size at marker time); `commitRepair` stats the log and refuses with `repair is stale` when the size differs before truncating — growth is a concurrent writer, shrink is an already-committed repair. This is the check-then-truncate equivalent of sqlite's transactional window; it narrows (not eliminates) the race, same as the sibling.

## Consequences

A BOM'd profile manifest boots. Every scrubbed credential-shaped ambient name logs one line per process naming what the child will not see (the deploying machine's real list — `ANTHROPIC_AUTH_TOKEN`, `AWS_ACCESS_KEY_ID`, … — surfaced immediately in verification). A damaged codex install fails at first use with an install hint. The orphan-turn class cannot regress silently. Multi-instance repairs refuse instead of discarding another writer's committed bytes; callers re-read and re-decide.

## Alternatives considered

- **P6 forwarding instead of scrubbing** — breaks the leak-prevention intent; the warning restores diagnosability without weakening the default.
- **P10 deep-equality on the rescan marker** — insufficient: a concurrent append past the torn bytes can leave the rescanned marker byte-identical (the scanner re-classifies mid-file corruption as a longer torn region). File size is the complete growth signal.
- **P10 full flock on session logs (the audit's P5)** — held out of this batch: single-host multi-instance operation on separate homes is unaffected, and a locking protocol is a design change, not a guard.
