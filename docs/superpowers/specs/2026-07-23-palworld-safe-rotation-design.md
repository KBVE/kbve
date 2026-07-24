# Palworld Safe-Rotation — Backup-Before-Upgrade + Version Hold Design

**Date:** 2026-07-23
**Issue:** follow-up to #14503 (Palworld Agones)
**Status:** design — Phase 1 planned

## Goal

Make Palworld image upgrades production-safe: snapshot the world save before every
rotation, and if the new image fails to reach `Ready`, hold on the known-good version
and alert instead of looping into a broken rotation.

## Motivation

The rotator (`ghcr.io/kbve/kubectl`, `rotate-gameserver` command in
`apps/vm/kubectl/src/main.rs`) watches image drift and deletes the `GameServer` so
ArgoCD `selfHeal` recreates it on the new tag. Today a bad image (won't build a bootable
server, REST/RCON won't bind — the `SERVER_SETTINGS_MODE=manual` class of regression)
produces a `GameServer` stuck `Scheduled`/`Unhealthy` with no automatic recovery, and a
server-version bump that rewrites the save format can strand the world with no
pre-upgrade copy to fall back to.

Two independent safety axes:

1. **Data safety** — a pre-rotation snapshot of the world save.
2. **Version safety** — detect the new version failing health and hold on the last
   known-good version.

Both are in scope. Version recovery is **detect + hold + alert** (human confirms the
roll-back), not fully automatic, to avoid fighting GitOps.

## GitOps interaction

Agones `GameServer.spec.template` is immutable. ArgoCD cannot patch a new image tag onto
a live `GameServer`; it only records the app as `OutOfSync`. A new tag is picked up
**only** when the `GameServer` is deleted and recreated, and the rotator owns that
delete.

Therefore "hold" = the rotator withholds the delete. The old known-good pod keeps
running; ArgoCD sits `OutOfSync` (harmless, expected) until a human resolves it.

**Known gap (accepted for detect+hold):** if the old pod dies *during* a hold, ArgoCD
recreates it on the bad git tag. Full-auto revert would pin the old tag by pausing
`selfHeal`; we deliberately do not, to keep the system simpler and avoid a stuck-paused
state. This gap is documented and alerted, not engineered around.

## Architecture

The rotator remains the single orchestrator. Its `rotate_once` drift-handling gains
three capabilities: pre-rotation backup (Phase 1), post-rotation health-gate + hold
(Phase 2), and a persisted state (Phase 2). Phase 1 is the foundation and ships alone.

### State — ConfigMap `palworld-rotator-state` (Phase 2)

Survives rotator restarts. Fields:

- `last_good_tag` — the last image tag that reached `Ready`.
- `current_tag` — the tag the live `GameServer` is running.
- `last_backup` — path of the most recent pre-rotation backup on the backups PVC.
- `hold` — bool; when true the rotator refuses to rotate and keeps alerting.
- `hold_tag` — the bad tag that triggered the hold (so drift back to a good tag clears it).
- `world` — the active `DedicatedServerName` (e.g. `CB8B6E`); the backup/restore scope.

### Backup mechanism — `kubectl exec` tar into the backups PVC

`palworld-saves` is Longhorn RWO and held by the game pod, so a second pod cannot
co-mount it. Instead:

- The game pod mounts **both** `palworld-saves` (`/palworld/Pal/Saved`) and the existing
  `palworld-backups` PVC (`/palworld/backups`).
- The rotator `kubectl exec`s `tar` **inside the live game container**, writing
  `backup-<world>-<ts>.tar.gz` to `/palworld/backups`.
- No second mount, RWO-safe. Same mechanism proven for the ad-hoc Desktop backup.

**Scoped to the active world (not the whole `Saved/` tree).** The save tree holds
multiple world folders (`SaveGames/0/CB8B6E`, `SaveGames/0/736A8B`, …) but only the
world pinned by `DedicatedServerName` in `Config/WindowsServer/GameUserSettings.ini` is
live. The backup tars **only** that world folder plus the config that pins and
configures it:

- `SaveGames/0/<world>/` — the active world (`<world>` = `DedicatedServerName`, e.g.
  `CB8B6E`).
- `Config/WindowsServer/GameUserSettings.ini` — holds the `DedicatedServerName` pin.
- `Config/WindowsServer/PalWorldSettings.ini` — the effective server settings.

The rotator resolves `<world>` from a `--world` flag, or, when unset, by reading
`GameUserSettings.ini` from the live pod. A scoped backup is smaller and, on restore,
cannot resurrect a stale/abandoned world sitting in the same tree.

**Quiesce:** before tarring, rely on the game's ~30 s autosave cadence being far shorter
than the rotation interval; the tarball captures the most recent autosave. (A REST-save
trigger before tar is a Phase 2 refinement once the relay's admin path is wired.)

Longhorn `VolumeSnapshot` is a viable future alternative (instant, no exec) but is
Longhorn-coupled and needs a snapshot-restore PVC dance; deferred.

### Retention

Keep the most recent N backups (default N=5) on the backups PVC; the rotator prunes older
`backup-*.tar.gz` after a successful backup. The backups PVC (5 Gi) holds N snapshots
comfortably (a scoped save compresses to a few MB).

## Flow (target, across phases)

On detecting image drift (`desired_tag != current_tag`):

1. **Hold check (Phase 2).** If `hold == true` and `desired_tag == hold_tag`, do nothing
   but re-emit the hold alert. If `desired_tag` differs from `hold_tag` (a new tag, a
   fix), clear `hold` and proceed.
2. **Backup (Phase 1).** `kubectl exec` tar the scoped world → backups PVC as
   `backup-<world>-<ts>.tar.gz`. Abort rotation on backup failure (never rotate without a
   backup); the pass is skipped and retried next tick.
3. **Rotate (existing).** Delete the `GameServer`; ArgoCD `selfHeal` recreates it on
   `desired_tag`.
4. **Health-gate (Phase 2).** Watch the new `GameServer` for `Ready` within the window
   (~15 min; Palworld cold boot ~300 s plus REST bind).
   - **Ready** → `last_good_tag = desired_tag`; prune to N backups; clear any hold.
   - **Not Ready in window** → set `hold`, `hold_tag`; stop looping; alert IRC/Discord.

Phase 1 delivers step 2 wired into the existing step 3. Steps 1 and 4 are Phase 2.

## Restore (Phase 3, manual)

A `restore <backup>` operation, triggered by a human after a hold:

1. Quiesce and delete the `GameServer` (releases the save PVC writer).
2. Restore the chosen `backup-<world>-*.tar.gz` into `palworld-saves` — either a one-shot
   Job that mounts the PVC (safe once the GS is deleted) or an init step in the recreated
   pod's entrypoint that restores before the server starts. Because the backup is
   world-scoped, the untar replaces only `SaveGames/0/<world>/` and its config, leaving
   any other worlds in the tree untouched.
3. Human bumps the image tag back to `last_good_tag` via the normal MDX → PR-to-dev path
   (no git auto-revert).

Manual trigger matches the detect+hold philosophy: the human confirms both the data
roll-back and the version roll-back.

## Phasing

Each phase ships independently working software.

| Phase | Scope | Deliverable |
|---|---|---|
| 1 | Pre-rotation backup (data safety) | Rotator tars the scoped world → backups PVC before every delete; retention keep-N; game-pod mounts backups PVC; `pods/exec` RBAC; opt-in `--backup` flags; kubectl image + rotation-deployment bump. |
| 2 | Health-gate + hold (version safety) | Rotator watches new GS `Ready` within window; on failure sets `hold`, alerts IRC/Discord, stops looping; on success sets `last_good_tag`, prunes; state ConfigMap. |
| 3 | Restore tooling (manual) | `restore <backup>` path (Job or entrypoint init) to roll the save back; documented version roll-back via MDX PR. |

## Components changed (Phase 1)

- `apps/vm/kubectl/src/main.rs` — `rotate_once` runs a scoped `kubectl exec` tar backup
  before the delete; new pure helpers (`backup_tar_args`, `prune_args`,
  `parse_dedicated_server_name`) with unit tests; `--backup`/`--world`/`--save-path`/
  `--backup-dir`/`--backup-keep` flags.
- `apps/kube/agones/palworld/manifests/gameserver.yaml` — game pod mounts
  `palworld-backups` at `/palworld/backups`.
- `apps/kube/agones/palworld/manifests/rotation-rbac.yaml` — add `pods/exec` create verb.
- `apps/kube/agones/palworld/manifests/rotation-deployment.yaml` — add `--backup` +
  scope args; bump rotator image tag.
- `apps/kbve/astro-kbve/.../kubectl.mdx` — version bump lever (MDX = truth); `version.toml`
  stays at the last-published baseline.

## Error handling

- **Backup fails** → abort rotation, do not delete GS, log error; retried next tick. A
  rotation without a backup is never allowed.
- **`--backup` not set** → behaviour identical to today (backup is strictly additive and
  opt-in), so Factorio's shared use of the same binary is unaffected.
- **World unresolvable** (no `--world`, `GameUserSettings.ini` unreadable) → backup fails
  → rotation aborts (fail safe, not silent skip).

## Testing

- Unit (in `apps/vm/kubectl/src/main.rs`): `backup_tar_args` produces the exact scoped
  `tar` argv; `prune_args` keeps N and removes the rest; `parse_dedicated_server_name`
  extracts the pin from both a plain line and an `OptionSettings=(...)` block and returns
  `None` when absent.
- e2e (`apps/vm/kubectl-e2e`): `rotate-gameserver --help` lists the new `--backup` flags.
- Integration (in-cluster, matches existing posture): drift → a
  `backup-<world>-<ts>.tar.gz` appears on the backups PVC → GS recreated on the new tag.

## Out of scope

- Fully automatic version revert (ArgoCD `selfHeal` pause / git auto-revert).
- Longhorn `VolumeSnapshot`-based backups (deferred alternative).
- Cross-cluster / off-site backup replication.
