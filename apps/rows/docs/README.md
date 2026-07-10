# ROWS Lifecycle Plans — Index

The plan set for the ROWS server lifecycle (empty-reaper → cooperative drain → fleet-restart) and
its cross-repo UE/chuck contract. **Read top-to-bottom: the order below is the build/dependency
order.** Full config detail lives in the
[config & docs index](./2026-06-24-rows-config-and-docs-index.md). Tracking issue:
[#13281](https://github.com/KBVE/kbve/issues/13281).

**Legend:** ✅ done · 🟡 partial · ⬜ not started · 🔄 living (never "done")

## Build order

| #   | Plan                                                                                     | Status                    | Notes                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | [rows-server-lifecycle-and-shutdown](./2026-06-24-rows-server-lifecycle-and-shutdown.md) | 🔄 design spec + runbooks | **Read first.** Umbrella design for drain/shutdown/fleet-restart; the `drain-*` plans implement it. Now also holds the fleet-restart operator runbook.                                                                                     |
| 1   | [rows-empty-server-reaper](./2026-06-23-rows-empty-server-reaper.md)                     | ✅ **done**               | Shipped in **PR #13200**, ships **inert** (all reaper switches gated OFF).                                                                                                                                                                 |
| 2   | [rows-drain-core](./2026-06-24-rows-drain-core.md)                                       | ✅ **done**               | **Phase 1.** Shipped in **PR #13537** (live on `dev`): drain state on `mapinstances`, reaper exemption, drain-aware join routing.                                                                                                          |
| 3   | [rows-drain-admission](./2026-06-24-rows-drain-admission.md)                             | ✅ **done**               | **Phase 2.** Shipped in **PR #13543** (live on `dev`): `admission_control` gate + retryable-rejection contract.                                                                                                                            |
| 4   | [rows-drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md)                     | 🟡 implemented            | **Phase 3.** Implemented in **PR #13575** (ships inert): `fleet_restart`/`deploy_state` tables, reconcile job, `/fleet-restart/*` endpoints, `/health` launcher contract, sealed trigger token. Phase-4 rollout pieces (R0–R3) still open. |

## Cross-cutting (not a build step)

| Plan                                                                     | Status    | Notes                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ue-chuck-drain-contract](./2026-06-24-ue-chuck-drain-contract.md)       | 🔄 living | The **UE5/chuck side** of the cooperative contract (heartbeat, SDK obligations, save budget). Synced to Phase 3 as-built 2026-07-10; with all ROWS phases shipped, the open gates are UE obligations. |
| [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md) | 🔄 living | Registry of every config knob + the document map. Add new knobs here in the same PR that introduces them.                                                                                             |

## At a glance

- **Implemented:** 4 of 5 build-order plans (reaper, drain core, admission, fleet-restart) — all ship inert/gated.
- **Next up:** the Phase-4 rollout pieces (R0 version-pinned PVC delivery → R1 parity gate → R3 orchestrator, blocked on the chuck login-crash), and the **player-presence phase** (valkey live tier: who's online, server/zone, locations — design in progress).
- **Gate to enable the reaper:** UE obligations #1–#3 in
  [ue-chuck-drain-contract](./2026-06-24-ue-chuck-drain-contract.md) (live heartbeat + accurate count
    - annotation self-shutdown) must hold in the target env first.
- **Gate to use fleet-restart:** UE obligations #4–#6 (react to the `draining` label, drain admission
  policy, save-on-shutdown), the reaper enabled in the env, and ROWS at ≥2 replicas.
