# Agent Note: Workspace boot flag

Status: implemented

English | [中文](2026-08-29-workspace-boot-flag.zh.md)

## Problem

Automated deployments boot `dsh web` for a machine-local workspace directory, but the workspace registry lives in the server process and until now was reachable only through the Web UI's sidebar flow or the gateway API — both require an interactive client. Profiles could not be launched with a workspace pre-registered, so overlay workflows had to hand-edit `~/.dsh/storages/workspace.json` while the server was stopped.

## Decision

The launcher parses repeatable `--workspace <path>` beside `--patch` (same collect pattern, same parent-option rejection for subcommands) and hands the paths to profile boot. `registerBootWorkspaces` in `apps/cli/src/profile-boot.ts` runs after `boot()` returns — the tree is fully mounted there, so `ctx.get('workspaceRegistry')` reads a ready registry — and calls the registry's idempotent per-canonical-path `create` for each path in argv order, before `appReady.commit()`. The registration lives in the launcher, not a tree plugin: no row in a shipped bundle patch can act on launcher flags, and the ordering constraint (registry service already provided) is a launcher-level lifecycle fact.

A composition that mounts no workspace registry (headless, sdk, bare custom profiles) fails loud with a remediation hint instead of silently skipping the requested registration; config dumps reject the flag at parse time because they boot nothing. Registration failure during teardown-initiated shutdown is suppressed through the same `suppressShutdownError` path as the patch-watchers.

## Consequences

`dsh web --workspace <path> --no-open` boots with the sidebar already listing the workspace; repeated boots reuse the existing record (verified: two paths register in argv order, a re-boot with the same path adds no duplicate). The `@deepseek-ai/dsh-workspace` dependency is devDependencies-only with a type-only import for the `ctx.workspaceRegistry` Context augmentation — the published CLI gains no runtime dependency. An upstream PR can carry the same shape; the flag is the Discussions-suggested form maintainers were most likely to accept.

## Alternatives considered

- A gateway HTTP route (`POST /api/workspaces` forwarder): needs the Fetch route-registration pattern and leaves the very first boot (before any client connects) without the workspace.
- A `dsh workspace` CLI subcommand operating on storage files directly: process isolation — the registry lives in the running server, so a stopped-server writer duplicates domain logic and risks corrupting the validated state machine.
- Registering inside `boot()`'s `prepare` hook: runs before the config tree mounts, when `workspaceRegistry` is not yet provided.
