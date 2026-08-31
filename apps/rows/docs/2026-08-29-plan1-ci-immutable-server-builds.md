# Plan 1 — CI immutable server builds

**Status:** shipped in PR #16510 (branch `atom-08291026-chuck-ci-immutable`).
Part of [ROWS Phase 4](./2026-08-29-rows-phase4-version-rollout-design.md).

This document describes what the publish path does now. It is not the original
implementation plan — that plan assumed a version-pinned fleet, which was dropped on
2026-08-30 (see §"What was dropped").

---

## What it does

`.github/scripts/ows/` holds the server publish logic, called from `ci-unreal-build.yml`
(`server_gate`, `server_build`, `server_prune`). Plain bash, unit-tested by
`bash .github/scripts/ows/tests/run-all.sh`, linted and run in CI by the `ows_scripts` job
in `ci-actionlint.yml`.

PVC layout is **flat** and immutable:

```
/mnt/longhorn/ows-server/<target>/<version>/chuckServer.sh
/mnt/longhorn/ows-server/<target>/latest -> <version>
```

Verified against the live PVC on 2026-08-30. There is no `LinuxServer/` level.

| Script | Job | Behaviour |
|---|---|---|
| `lib.sh` | — | `ows_is_deployed()` — the single "is this a complete build" predicate, shared so the gate and the deploy cannot drift. Recognises the flat layout, and a nested `<ver>/LinuxServer/` build defensively. |
| `gate.sh` | `server_gate` | Prints `should_build=true\|false`. Skips when the version is already published. Honours `FORCE_REPUBLISH`, without which the escape hatch is unreachable — `server_build` is gated on `should_build`. |
| `deploy.sh` | `server_build` | Stages into `.stage-<ver>.$$`, renames the old tree aside, `mv -T`s the new one in, then unlinks. Atomic: a killed runner never leaves a partial version dir, and a pod holding old binaries open is never unlinked out from under. Refuses a complete deploy (exit 3) unless `FORCE_REPUBLISH=true`; replaces a partial one. |
| `latest.sh` | `server_build`, `server_gate` | Forward-only, create-then-rename. Called on a gate skip too — otherwise re-dispatching a published version is a green no-op that never moves `latest`. |
| `prune.sh` | `server_prune` | Keeps newest `KEEP=2`, the `latest` target, and dirs holding an NFS silly-rename. Sweeps `.stage-*`, `.old-*` and stale `latest.tmp.*` older than a day. |

`KEEP=2` is the running version plus the one just published. It is also how rollback works:
delete the bad newest version and the launchers fall back to the previous one at the next
pod start.

`ref: dev` is pinned explicitly on every script checkout. A called workflow's default
checkout ref is the *caller's* ref, and `ci-main.yml` dispatches `--ref main`, where these
scripts do not exist.

---

## What was dropped (2026-08-30)

The original plan protected old versions from prune using `OWS_SERVER_VERSION` pins in
`fleet.yaml` plus live `ows.kbve.com/server-version` labels on Agones Fleets and
GameServers, read with a dedicated `arc-fleet-reader` ServiceAccount.

The fleet is not pinned, so none of that has a subject. The launchers resolve the build
themselves at every container start:

```sh
find /server -maxdepth 1 -type d -name '[0-9]*' | sort -V | tail -1
```

A restarting pod always re-resolves to the **newest** version, so no pod ever depends on an
older directory. Deleted: `protected-versions.sh` and its fixtures, `PROTECTED_FILE` and the
`KEEP_FLOOR` guard, `ows-prune-rbac.yaml`, the `serviceAccountName` change in
`values-ue.yaml`, and `server_prune`'s checkout of `main`. **This PR adds no cluster
permissions.**

The `.nfs*` check is retained but is courtesy, not protection: silly-renames only appear
after an unlink races an open file, so it does not save a running-but-untouched dir on the
first pass. Nothing depends on it being correct.

---

## Known gaps

- **A publish does not roll the fleet.** Agones has no reason to replace a `Ready`
  GameServer without a template change, and there is no longer a template change. Verified
  2026-08-30: both beta GameServers on `0.3.53` with the PVC at `0.3.54`. New pods get the
  newest build; existing ones stay until deleted. Closing this is Phase 4 Plan 3, or an
  operator `RestartFleet`.
- **`ref: dev` is a branch, not a SHA.** `server_gate` resolves it at T0 and `server_build`
  up to 8 hours later, so a push to `dev` mid-run can make them execute different revisions
  of `lib.sh`. Fix is to resolve the SHA once in `server_config`.
- **A hard-killed runner** (SIGKILL, node loss) bypasses the cleanup trap; `prune.sh`'s
  sweep collects the leftovers on the next run.
- **50Gi PVC.** `KEEP=2` multi-GB cooked servers plus a transient second copy during
  publish. Headroom is thin.
