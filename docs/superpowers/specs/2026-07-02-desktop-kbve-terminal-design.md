# desktop-kbve Terminal — Design Spec

Epic: https://github.com/KBVE/kbve/issues/13734
Date: 2026-07-02
App: `apps/kbve/desktop-kbve` (crate `kbve-desktop`) — Tauri 2 + React 19 + Zustand 5 + actor-based view system.

## Goal

Make desktop-kbve a first-class desktop terminal workspace: embedded terminal emulator, tmux session management, and a ratatui-driven session manager — plus general React-side hardening.

## Chosen Architecture: PTY-rendered ratatui

The Rust backend owns real PTYs; a ratatui TUI is the session-manager brain; xterm.js in the webview is a dumb, fast renderer. The same TUI can later run standalone over SSH.

Rejected alternatives:

- **Ratzilla (ratatui→WASM→DOM)** — sharp text but frontend/backend split gets awkward; young ecosystem.
- **React mimicking TUI aesthetic** — most maintainable but no SSH reuse, less terminal-native.

### 1. PTY layer (Rust) — `TerminalActor`

- New `ViewActor` at `src-tauri/src/views/terminal.rs` plus a `pty/` module.
- `portable-pty` spawns shells/commands in real PTYs (macOS/Linux, Windows via ConPTY).
- Each PTY = one tokio task; output bytes streamed to the frontend via Tauri events (`terminal://data/<pane-id>`), input via a `terminal_write` command, resize via `terminal_resize`.
- Pane registry in DashMap, consistent with the existing `ViewManager` pattern. CancellationToken per pane.

### 2. tmux layer (Rust) — `TmuxService`

- Talks to system tmux via **control mode** (`tmux -CC attach`) — structured protocol, not output scraping. Provides session/window/pane listing, create/kill/rename, and live layout events.
- Fallback plain-CLI mode (`tmux list-sessions -F ...`) when control mode is unavailable.
- Exposed as ViewCommands: `Custom("tmux.list")`, `tmux.create`, `tmux.attach`, `tmux.kill`, `tmux.rename`.
- "Attach" = spawn a PTY running `tmux attach -t <session>`, rendered in an xterm.js pane. tmux handles windows/panes internally; our UI adds the outer session picker and status.

### 3. Ratatui layer (Rust) — session-manager TUI

- Small ratatui app (`kbve-term-tui`, new crate or module): session list, preview, keybind-driven (j/k navigate, Enter attach, n new, x kill, r rename).
- Runs inside its own PTY pair (ratatui writes to the PTY slave; xterm.js renders the master output). Queries `TmuxService` over an internal channel.
- Opening the Terminal view shows the ratatui manager; attaching swaps that pane to a live tmux client.

### 4. React frontend

- New view `src/views/terminal.tsx` registered in the existing view registry (mounts once, never unmounts — no terminal reflow on navigation).
- `@xterm/xterm` + addons: `fit`, `webgl` (GPU render), `search`, clipboard, web-links.
- Tab strip for multiple local panes (each = PTY id); tmux sessions live inside one attached pane.
- Zustand `terminal` store: pane list, active pane, per-pane title/status — follows the existing Slot/direct-DOM patch pattern for O(1) updates.

## General React improvements (same pass)

- Error boundaries around views (currently one view crash kills the whole ViewHost).
- Keyboard shortcut system: `Cmd+T` new terminal, `Cmd+K` command palette stub, `Cmd+1..9` view switch — wired into the existing shortcuts view.
- Settings additions: font family/size, shell path, tmux binary path, scrollback limit — persisted via the existing `tauri-plugin-store` settings store.

## Error handling

- PTY spawn failure → pane shows an inline error state; actor stays Idle.
- tmux missing → session manager shows "tmux not found"; plain-shell mode still works (Windows default).
- Backpressure: PTY output chunked (~8KB) and coalesced per animation frame before emit — avoids IPC flooding on `yes` / `cat bigfile`.

## Testing

- Rust: unit tests on the tmux control-mode parser and PTY actor lifecycle (spawn/echo/kill), same style as `views/tests.rs`.
- Frontend: vitest on the terminal store + registry, using the existing Tauri mocks in `__mocks__/`.

## Phases

1. **Phase 1** — PTY backend + xterm.js single pane (foundation, immediately useful)
2. **Phase 2** — Multi-pane tabs, terminal settings, keyboard shortcuts, error boundaries
3. **Phase 3** — TmuxService (control mode) + attach flow
4. **Phase 4** — Ratatui session-manager TUI

## Subagent Execution Flow

Execution follows `superpowers:subagent-driven-development`. Orchestrator stays in the main session; each task below is dispatched to a fresh implementation subagent with this spec + the task brief; a reviewer subagent checks each result before the next task starts.

Ground rules for every subagent:

- Work in a git worktree off `dev` (never checkout in the main repo; never push `dev`/`main` directly).
- Build/test via `./kbve.sh -nx desktop-kbve:<target>` — no raw cargo/vite.
- No code comments in produced code. No manual version bumps.
- TDD: failing test first where the surface allows (parsers, stores, actor lifecycle).

### Phase 1 tasks (independent where marked ∥)

| #    | Task                                                                                                                                          | Inputs                          | Done when                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| 1a ∥ | Rust PTY module: `pty/` with spawn/read/write/resize/kill over `portable-pty`, tokio task per pane, DashMap registry                          | Cargo.toml deps: `portable-pty` | Unit test: spawn `echo hi`, read back, clean kill |
| 1b ∥ | Frontend deps + terminal store: add `@xterm/*` packages (root pnpm per repo convention), Zustand `terminal` store (pane list, active id)      | package.json                    | vitest green on store                             |
| 1c   | `TerminalActor` ViewActor wiring: commands `terminal_open/write/resize/close`, events `terminal://data/<id>`; register in `mod.rs` + `lib.rs` | 1a                              | `views/tests.rs`-style lifecycle test             |
| 1d   | `terminal.tsx` view: xterm.js mount, fit addon, event subscription, input forwarding; register in view registry + sidebar                     | 1b, 1c                          | Manual: interactive shell works in app            |

### Phase 2 tasks

| #    | Task                                                                           | Depends |
| ---- | ------------------------------------------------------------------------------ | ------- |
| 2a   | Tab strip multi-pane UI + per-pane lifecycle                                   | Phase 1 |
| 2b ∥ | Error boundaries around ViewHost views                                         | —       |
| 2c ∥ | Shortcut system (`Cmd+T`, `Cmd+1..9`, `Cmd+K` stub)                            | —       |
| 2d   | Terminal settings (font, shell path, tmux path, scrollback) via settings store | 2a      |

### Phase 3 tasks

| #   | Task                                                                    | Depends     |
| --- | ----------------------------------------------------------------------- | ----------- |
| 3a  | tmux control-mode parser (pure, heavily unit-tested)                    | —           |
| 3b  | `TmuxService`: control-mode session + CLI fallback, ViewCommand surface | 3a          |
| 3c  | Attach flow: PTY running `tmux attach`, session picker UI hooks         | 3b, Phase 2 |

### Phase 4 tasks

| #   | Task                                                                                   | Depends     |
| --- | -------------------------------------------------------------------------------------- | ----------- |
| 4a  | `kbve-term-tui` ratatui app: session list/preview/keybinds against `TmuxService` trait | 3b          |
| 4b  | Embed TUI in PTY pair as default Terminal-view landing surface                         | 4a, Phase 1 |

Review gates: after each phase, a code-review subagent runs against the phase diff; findings resolved before next phase dispatch. After Phase 1 and Phase 3, `verify` end-to-end (launch app, drive shell / tmux attach).

## Open questions

1. Ratatui flavor confirmed as PTY-rendered (vs Ratzilla WASM or React-mimic)? — awaiting user.
2. Windows: tmux absent — plain-shell mode only there, tmux features macOS/Linux? — awaiting user.
