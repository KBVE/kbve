# ROWS Lifecycle Plans — Index

The plan set for the ROWS server lifecycle (empty-reaper → cooperative drain → fleet-restart) and
its cross-repo UE/chuck contract. **Read top-to-bottom: the order below is the build/dependency
order.** Full config detail lives in the
[config & docs index](./2026-06-24-rows-config-and-docs-index.md).

> Also surfaced at the docs root: [`docs/README.md`](../../README.md).

**Legend:** ✅ done · 🟡 partial · ⬜ not started · 🔄 living (never "done")

## Build order

| # | Plan | Status | Notes |
|---|---|---|---|
| 0 | [rows-server-lifecycle-and-shutdown](./2026-06-24-rows-server-lifecycle-and-shutdown.md) | ⬜ design spec | **Read first.** Umbrella design for drain/shutdown/fleet-restart; not code itself — the `drain-*` plans implement it. |
| 1 | [rows-empty-server-reaper](./2026-06-23-rows-empty-server-reaper.md) | ✅ **done** | Shipped in **PR #13200**, ships **inert** (all reaper switches gated OFF). The only implemented plan in this set. |
| 2 | [rows-drain-core](./2026-06-24-rows-drain-core.md) | ⬜ not started | **Phase 1.** Drain state on `mapinstances`, reaper exemption for draining instances, drain-aware join routing. Foundation for Phases 2–3. |
| 3 | [rows-drain-admission](./2026-06-24-rows-drain-admission.md) | ⬜ not started | **Phase 2.** Admission control during drain. **Blocked on Phase 1** (reuses its degrade path + control-plane pattern). |
| 4 | [rows-drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md) | ⬜ not started | **Phase 3.** Coordinated fleet-wide restart orchestration + "all drained" signal. **Blocked on Phases 1 & 2.** |

## Cross-cutting (not a build step)

| Plan | Status | Notes |
|---|---|---|
| [ue-chuck-drain-contract](./2026-06-24-ue-chuck-drain-contract.md) | 🔄 living | The **UE5/chuck side** of the cooperative contract (heartbeat, SDK obligations, save budget). Cross-repo; update as each ROWS phase lands. Some obligations (heartbeat, self-shutdown) are **required now** to safely enable the shipped reaper. |
| [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md) | 🔄 living | Registry of every config knob + the document map. Add new knobs here in the same PR that introduces them. |

## At a glance

- **Implemented:** 1 of 5 build-order plans — the empty-server reaper (inert until per-env enablement).
- **Next up:** Phase 1 `rows-drain-core` — everything else (admission, fleet-restart) is gated behind it.
- **Gate to enable the reaper:** the UE obligations #1–#3 in
  [ue-chuck-drain-contract](./2026-06-24-ue-chuck-drain-contract.md) (live heartbeat + accurate count
  + annotation self-shutdown) must hold in the target env first.
