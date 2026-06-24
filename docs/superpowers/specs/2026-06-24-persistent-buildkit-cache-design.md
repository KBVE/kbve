# Persistent BuildKit Cache — design

## Problem

CI docker builds on the ARC runners use an **ephemeral** buildx builder
(`driver: docker-container`, a fresh `moby/buildkit` container spun per job
inside the DinD sidecar). Every `--mount=type=cache` dir (astro `.astro`,
cargo registry, sccache-local, pnpm store) and the BuildKit layer cache start
**empty every run** and die with the pod. The registry `cache-from/to` only
papers over this, and importing a `mode=max` cache is itself slow.

Observed on `CI - Docker / axum-kbve` e2e (run 28097748154, ~31min build, ~5s
actual test):

| Phase | Time | Cause |
|---|---|---|
| registry cache import + setup | ~3.5min | cold ephemeral builder |
| Astro build (Stage A) | ~9.5min | api.mdx version bump busts the layer **every release** |
| chef cook + foundation crates | ~1min | sccache 100% hit (already optimal) |
| axum-kbve app compile + link | ~12.4min | app crate source changed |
| cache export (mode=max) | ~4min | uploads every layer to ghcr |
| vitest e2e | ~5s | the actual test |

The Astro static site is **not skippable** — Astro emits the askama templates
the axum binary serves (`templates/dist/askama` → `templates/askama`), tested by
`static`/`content-routes`/`askama`/`compression`/`redirects` specs. Astro must
be made **incremental**, not removed.

## Solution

One standing **`buildkitd`** Deployment whose `/var/lib/buildkit` (layer cache
**and** every `--mount=type=cache` dir) lives on a PVC. All buildx jobs target
it via the `remote` driver. Warm cache across ephemeral runs:

- `.astro` mount warm → changed api.mdx rebuilds in **seconds**, not 9.5min.
- cargo registry / git / sccache-local / pnpm store stay warm.
- layer cache reused without registry import.

### Why remote/shared buildkitd is safe here (and the shared *dockerd* was not)

The Unity (game-ci) / UE bind-mount problem — `docker run -v $GITHUB_WORKSPACE`
resolves paths on the *daemon's* filesystem — does **not** apply: buildkitd never
bind-mounts a host path, buildx **streams the build context** over the gRPC API.
So a shared build server is clean for builds. The DinD sidecar stays for
`--load` + `docker run` (e2e container), which still need a local docker daemon.

## Components (ns `arc-runners`, `buildkitd.yaml`)

- **PVC `buildkitd-cache`** — RWO, `longhorn-sdb` (ext4 block), 150Gi. RWO is
  fine: **only buildkitd touches the PVC**, runners reach it over TCP. Sidesteps
  the Longhorn-RWX-breaks-overlayfs trap entirely.
- **Deployment `buildkitd`** — `replicas:1`, `strategy: Recreate`, privileged,
  `moby/buildkit:v0.24.0` (matches the version the workflow already pins),
  `--addr tcp://0.0.0.0:1234`, `/var/lib/buildkit` on the PVC.
- **ConfigMap `buildkitd-config`** — `buildkitd.toml`: oci worker, overlayfs
  snapshotter (ext4 PVC → no overlay-on-overlay EINVAL; fall back to `native` if
  it ever surfaces), GC `gckeepstorage=110GB` so the cache self-prunes below the
  150Gi PVC (no manual-GC ENOSPC time-bomb).
- **Service `buildkitd`** — ClusterIP `:1234`.
- **NetworkPolicy `buildkitd-ingress`** — `:1234` ingress restricted to
  `arc-runners` pods. (NetworkPolicy-only; no mTLS. In-cluster, single-node
  today. Revisit mTLS if the threat model widens.)

## Cache-id hygiene (prerequisite — masked today by ephemeral builders)

Ephemeral builders mean cache-mount ids never collide (nothing persists). Once
buildkitd is persistent, ids become **shared state**. Audit:

- **Layer cache / cargo / sccache (×41) / pnpm (×8)** — content-addressed global
  stores. Shared across projects is correct and beneficial. No change.
- **`.astro` is per-project** → each astro Dockerfile needs a **unique** id.
  Today 3 use the mount: `astro-cache` (kbve — generic, a copy-paste trap),
  `astro-rareicon-cache`, `astro-chuckrpg-cache`. Rename kbve →
  `astro-kbve-cache`; convention `id=astro-<app>-cache`. Add `sharing=locked` to
  astro mounts (serialize same-id concurrent builds; `.astro` is not
  concurrent-safe). Leave cargo/pnpm/sccache `shared` (own locking).
- 5 astro apps build astro fully every run with **no** cache mount (memes,
  irc-gateway, cryptothrone, herbmail, discordsh) — add uniquely-id'd
  `astro-<app>-cache` mounts so persistent buildkit makes them incremental too.

## e2e quick wins (independent of buildkitd)

- Build the e2e image **unoptimized** (debug profile) — the e2e checks behavior,
  not perf; `--release` full-opt of the app crate is ~12min wasted. Publish keeps
  `--release`.
- Drop `--cache-to=registry,mode=max` from the **e2e** path (~4min export). The
  persistent builder is the cache; the publish workflow owns the registry seed.

## Runner wiring (the flip — lands LAST)

Replace the `Setup Docker Buildx` step (`driver: docker-container`) in the build
workflows (`docker-test-app.yml`, `utils-publish-docker-image.yml`) with:

```
docker buildx create --name persistent --driver remote \
  tcp://buildkitd.arc-runners.svc.cluster.local:1234 --use
```

Keep the DinD sidecar for `--load` + `docker run`.

## Concurrency

buildkitd is built for concurrent builds. Multiple runners build against the one
daemon; per-cache-mount-id locking may briefly serialize two simultaneous Rust
builds on the shared cargo-registry mount — acceptable, still far cheaper than
cold. Single-node today; runners reach buildkitd over TCP so no node-pinning.

## Failure modes / rollback

- buildkitd down → builds fail fast. Mitigate: keep `cache-to=registry` seed on
  the **publish** path so a rebuilt buildkitd re-warms from ghcr. Rollback =
  flip the workflow buildx step back to `docker-container` (one line).
- PVC corruption → delete PVC, buildkitd recreates empty, re-warms from seed.
- GC mis-tuned → tune `gckeepstorage` vs observed working set.

## Rollout (staged, one branch)

1. **C1** — land buildkitd infra (inert; nothing targets it). Verify Ready.
2. **C2** — cache-id hygiene (namespace astro ids + `sharing=locked` + 5 missing
   mounts). Safe with the still-ephemeral builders.
3. **C3** — e2e quick wins (debug profile + drop e2e cache-to).
4. **C4** — flip the workflow buildx step to the remote driver. Measure 2–3 e2e
   runs on `arc-runner-set`, then it's the default for all buildx jobs.

Each stage is independently revertible; the chicken-egg (runners pointing at a
buildkitd that isn't up) is avoided by landing C4 only after C1 is verified live.

## Expected result

e2e ~31min → ~13–15min once warm (astro 9.5→~1min, import ~3.5→0, export 4→0;
app compile addressed separately by debug profile). Every other buildx job
inherits the same warm cache.

## Out of scope

- `arc-runner-ue` `/var/lib/docker` image-store PVC (the 50GB UE pull) — a
  different mechanism (image store, not build cache); tracked separately.
- Unity / UE shared *dockerd* — rejected (game-ci bind-mount path problem).
