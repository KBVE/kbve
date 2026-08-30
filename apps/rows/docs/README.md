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
| 5   | [phase4-version-rollout](./2026-08-29-rows-phase4-version-rollout-design.md)             | 📜 history + audit        | **Phase 4, rev 7.** The version-pin design is dropped; Plan 2 deleted, Plan 3 superseded. Kept for §1, the verified current-state audit of CI, fleets, reporter and fleet-restart machinery. |
| 5a  | [plan1-ci-immutable-server-builds](./2026-08-29-plan1-ci-immutable-server-builds.md)     | ✅ **done**               | **Phase 4 Plan 1.** Shipped in **PR #16510**: flat immutable PVC publish, working build gate, atomic stage-and-swap, prune keeping newest 2. No fleet change, no cluster permissions. |
| 5b  | [whole-fleet-version-roll](./2026-08-30-rows-whole-fleet-version-roll.md)                | 📋 design                 | **Phase 4 Plan 2 (replacement).** Roll every zone at once when the game is empty: ROWS repoints a `/server/current` symlink, `scale_fleet(0)`, the FleetAutoscaler refills onto it. No git pin, no mixed-version window at any point. Rev 2, not implemented. **Blocked on the empty-server reaper being enabled** — without it the trigger never fires. |

## Cross-cutting (not a build step)

| Plan                                                                     | Status    | Notes                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ue-chuck-drain-contract](./2026-06-24-ue-chuck-drain-contract.md)       | 🔄 living | The **UE5/chuck side** of the cooperative contract (heartbeat, SDK obligations, save budget). Synced to Phase 3 as-built 2026-07-10; with all ROWS phases shipped, the open gates are UE obligations. |
| [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md) | 🔄 living | Registry of every config knob + the document map. Add new knobs here in the same PR that introduces them.                                                                                             |
| [ows-users-tenant-scoped-pk](./2026-08-24-ows-users-tenant-scoped-pk.md) | 📋 runbook | Deploy order, pre-flight, and rollback posture for the `ows.Users` `(CustomerGUID, UserGUID)` re-key. **Migrations must land before `rows` 0.1.39 serves traffic.**                                    |

## At a glance

- **Implemented:** 4 of 5 build-order plans (reaper, drain core, admission, fleet-restart) — all ship inert/gated. Phase 4 Plan 1 (CI publish) is shipped in PR #16510.
- **Next up:** the whole-fleet version roll (plan 5b) — ROWS scales the fleet to zero once the
  game is empty and the autoscaler refills onto the newest build. Nothing rolls the fleet today:
  a publish reaches only newly created pods, so an existing `Ready` GameServer stays on its build
  until deleted by hand. Also open: the **player-presence phase** (valkey live tier — design in progress).
- **Gate to enable the reaper:** UE obligations #1–#3 in
  [ue-chuck-drain-contract](./2026-06-24-ue-chuck-drain-contract.md) (live heartbeat + accurate count
    - annotation self-shutdown) must hold in the target env first.
- **Gate to use fleet-restart:** UE obligations #4–#6 (react to the `draining` label, drain admission
  policy, save-on-shutdown), the reaper enabled in the env, and ROWS at ≥2 replicas.
