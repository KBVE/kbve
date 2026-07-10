# kbve.unreal — clangd database + agent-facing C++ checks

Date: 2026-07-02
Status: Approved

## Problem

C++ IntelliSense for the Unreal plugins in `packages/unreal/` has never been accurate: no `compile_commands.json` or `c_cpp_properties.json` exists, so cpptools fell back to tag-parser guessing (and burned 8+ hours of CPU indexing, freezing VS Code). AI tooling (`ms-vscode.cpp-devtools`) queries that same broken backend, so agents and Copilot get wrong or empty symbol information. Coding agents validating a UE C++ edit must run a full UBT build (2–10 minutes) per iteration.

## Goal

One generated artifact — a clang compilation database from UBT — serving two consumers:

1. Humans in VS Code via clangd: accurate go-to-definition, references, diagnostics with real UBT defines and engine include paths.
2. Coding agents via CLI: per-file syntax/semantic validation in seconds instead of a full UBT build.

## Non-goals

- Runtime debugging (lldb attach, breakpoints, crash capture) — future work that can live in the same package.
- Build/cook orchestration wrappers.
- Windows/Linux support in v1 (Mac only; flags exist to extend).

## Approach

Pure-stdlib subprocess wrapper (approach A). No new dependencies, no optional extra needed. A clangd-based check engine (`clangd --check`) can be added later behind a flag if editor-identical semantics are wanted.

## Package layout

`packages/python/kbve/kbve/unreal/`, following the existing `sprite`/`osrs`/`seo` module pattern:

```
kbve/unreal/
  __init__.py
  ubt.py        # locate UE install + Build.sh, run UBT commands
  clangd.py     # GenerateClangDatabase wrapper + .clangd writer  → kbve-unreal-clangd
  check.py      # per-file syntax check from compile DB           → kbve-unreal-check
```

## Component: ubt.py

- Parse a `.uproject` for `EngineAssociation` (e.g. `5.8`) and resolve the engine root, defaulting to `/Users/Shared/Epic Games/UE_<ver>`; overridable via `--engine-root` / `KBVE_UE_ROOT`.
- Build and run `Engine/Build/BatchFiles/Mac/Build.sh` command lines.
- `--dry-run` support: print the exact command without executing (also the unit-test seam for UBT invocation).

## Component: clangd.py → `kbve-unreal-clangd`

Defaults: `--project apps/rentearth/unreal-rentearth/rentearth.uproject --target chuckEditor --config Development --platform Mac`.

1. Run UBT `-mode=GenerateClangDatabase` for the target.
2. Ensure the resulting `compile_commands.json` lands at `apps/rentearth/unreal-rentearth/compile_commands.json` (UBT output location varies by UE version; relocate if needed). File is gitignored (often 50–200 MB).
3. Write/update a committed `.clangd` at the monorepo root with a `CompilationDatabase:` pointer to that directory. One DB serves the whole monorepo — `rentearth.uproject` mounts `packages/unreal` via `AdditionalPluginDirectories`, so all KBVE* plugin sources appear in the DB. Pointer swaps if another uproject becomes primary.

`chuckEditor Development Mac` is the default target because the editor target has the broadest compile surface (`WITH_EDITOR` paths included).

## Component: check.py → `kbve-unreal-check <file...>`

Agent-facing validation, called after every UE C++ edit:

1. Load the compile DB once (resolved via the root `.clangd` pointer or `--db` flag).
2. For each file argument, find its DB entry, rewrite the command to `-fsyntax-only` (strip `-o`/output args), and run it.
3. Header files (`.h`): not in the DB directly — check via a source file that includes it, falling back to the nearest sibling `.cpp` in the same module.
4. Output: terse `file:line:col: error: msg` lines only; exit non-zero when any file has errors. No decoration — agent-parseable.
5. File not found in DB → clear message: regenerate with `kbve-unreal-clangd`.

Expected latency ~2–5 s per file (clang frontend on UE headers), versus minutes for a UBT round-trip.

## Wiring

- Two `[project.scripts]` entries in `packages/python/kbve/pyproject.toml`: `kbve-unreal-clangd`, `kbve-unreal-check`.
- nx target `clangd-db` on `apps/rentearth/unreal-rentearth/project.json` invoking the generator.
- CLAUDE.md note instructing agents to run `kbve-unreal-check` on edited UE C++ files before attempting a full build.
- VS Code: cpptools IntelliSense already disabled in `.vscode/settings.json`; recommend `llvm-vs-code-extensions.vscode-clangd` which picks up the root `.clangd` automatically.

## Error handling

- Missing engine install → actionable error naming the expected path and the override flag.
- UBT failure → surface UBT exit code and last lines of output.
- Stale DB (file missing from DB) → regenerate hint, exit code distinct from compile errors.

## Testing

- Unit tests (pytest, existing harness): DB lookup, flag rewrite (`-fsyntax-only` substitution, `-o` stripping), header→source fallback, not-in-DB error path — all against a small fixture `compile_commands.json`.
- UBT invocation covered via `--dry-run` command-line assertion; no engine required in CI.
