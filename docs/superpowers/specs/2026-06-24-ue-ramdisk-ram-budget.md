# WS-2 — RAM Budget Worksheet (UE shared-ramdisk)

**Companion to:** `2026-06-24-ue-ramdisk-shared-build-design.md` (§4 "Node RAM ceiling")
**Status:** Worksheet — sizing record for `maxRunners: 3` (server + game Linux pods + one plugin/engine Linux build concurrently; Windows VM in parallel; Mac on a separate box). On the corrected node size (~500 GB, below) the budget closes with large margin, so the **binding constraint is no longer node RAM — it is the tmpfs `size=` ceiling** (set to **200 GB** for the 3-cook target), which caps how many concurrent build scratches the shared store can hold. Numbers marked `MEASURE` are still worth filling in during §5 to confirm the ceiling fits, but they no longer gate go/no-go the way they did under the old 109 GB assumption.
**Node:** single Talos node, total physical RAM **≈500 GB**, shared by k8s control plane, etcd, ClickHouse, Postgres, the KubeVirt VM, and the ARC runner pods.

> **Correction (operator, 2026-06-24):** earlier drafts of this design used **≈109 GB** and labeled it "verified against the repo." That was wrong — physical RAM is **not** in the repo (`talos-worker.yaml` has no memory field), so 109 was an unverified assumption. The real node is **~500 GB**. This flips the old headline ("budget does not close, stay at `maxRunners: 1`"): at 500 GB the budget closes comfortably and **`maxRunners: 3`** is the chosen target (server + game + one plugin/engine Linux build concurrent). The tmpfs ceiling (200 GB) is the deliberate safety cap, sized well below node RAM rather than against it.

> This worksheet is inert: it changes nothing. It exists to record the sizing and to make the go/no-go on `maxRunners: 3` (and any later bump to 4) an explicit, evidenced decision.

## Why "move scratch to the shared tmpfs" does NOT save RAM

The only RAM the design actually reclaims is **de-duplication**, not relocation:

- **Saved:** one engine image copy instead of two (~40 GB), and one repo mirror instead of per-build clones.
- **NOT saved:** per-build scratch (materialized project + cook output). Whether it lives in a per-pod `medium: Memory` emptyDir (`work` 24Gi, `shared-tmp` 16Gi in `values-ue.yaml`) or in the shared `/var/mnt/ramdisk` tmpfs, it is the **same physical RAM on the same one node**. A `sizeLimit` is a cap, not a reservation, so an empty emptyDir costs ~0 — but the bytes don't vanish, they move to the shared tmpfs and are counted there.

**Consequence (revised for ~500 GB):** the dedup still saves ~40 GB, but on a 500 GB node that saving is no longer the margin everything has to squeeze into — there is hundreds of GB of headroom. The real limit shifts to the **tmpfs `size=` ceiling (200 GB)**: every concurrent Linux build's scratch lives in that one shared store alongside the engine + mirror, so the ceiling — not node RAM — is what bounds concurrency. Pick the ceiling to fit `engine + mirror + N_runners × peak_scratch`, and keep it well under node RAM so a tmpfs at its cap can never starve etcd.

## The inequality that must close

```
  engine_overlay_shared            (one copy, read-mostly base)
+ repo_mirror                      (~7 GB objects)
+ N_runners × per_build_scratch    (materialized project + cook output, RAM-backed)
+ VM_ram                           (20 GiB limit / 16 GiB guest)
+ repo_img + win_clone_copy        (Windows RO disk image + the guest's full clone — RAM only while the VM is up; count if Windows can overlap Linux)
+ node_baseline                    (etcd + ClickHouse + Postgres + control plane + kubelet + OS)
+ page_cache_margin                (eviction headroom — etcd fdatasync is already the documented failure, #12987)
  ────────────────────────────────
  < 500 GB   (with margin — and in practice it clears this by hundreds of GB)
```

**Two ceilings, and the tighter one binds:**
1. **Node RAM:** the whole sum above must stay `< 500 GB`. On real numbers this is never close.
2. **tmpfs `size=` (200 GB):** the shared-store terms only — `engine_overlay_shared + repo_mirror + N_runners × per_build_scratch + repo_img` — must stay under the tmpfs cap, or the store hits ENOSPC mid-build (the "ENOSPC relocated into RAM" failure). This is the one to size against. The runner pods' own `medium: Memory` emptyDirs (`work` 24Gi + `shared-tmp` 16Gi) live **outside** the tmpfs and count only against ceiling (1), node RAM.

## Worksheet (fill during §5 validation)

| Term | Source / how to measure | Value |
|---|---|---|
| `engine_overlay_shared` | `du -sh /var/mnt/ramdisk/docker` after one pull; `docker system df` | `MEASURE` (spec assumes ~40 GB extracted) |
| `repo_mirror` | `du -sh /var/mnt/ramdisk/repo.git` | `MEASURE` (spec assumes ~7 GB) |
| `per_build_scratch` (peak) | `du -sh` of `/var/mnt/ramdisk/<run>-<job>/{project,output}` at cook peak; watch with `ramdisk-watch-kube.sh` | `MEASURE` — **the dominant unknown** |
| `N_runners` | `maxRunners` in `values-ue.yaml` | 1 today (inert baseline); **3 = the target** (server + game + one plugin/engine Linux build concurrent). Going to 4 needs a bigger ceiling — see "Scaling `maxRunners`" below |
| `VM_ram` | `vm-windows-builder.yaml` `domain.memory.limits` | 20 GiB |
| `repo_img` (Windows) | sized RO disk image on tmpfs (git + LFS); `du -sh /var/mnt/ramdisk/repo.img` | `MEASURE` — RAM only while VM up |
| `win_clone_copy` (Windows) | full plain clone in the guest's own work disk (objects + LFS, **not** deduped) | `MEASURE` — RAM only while VM up |
| `node_baseline` | node `free -g` with builds idle, VM off | `MEASURE` (est. 15–25 GB) |
| `page_cache_margin` | policy choice | ≥ 10 GB recommended |

## Worked sensitivity (illustrative)

**Node-RAM ceiling — with everything running at once** (3 Linux cooks + the Windows VM + Mac is a separate box, so it costs nothing here):

```
500
 − 200  (tmpfs ceiling: engine 45 + mirror 7 + 3×scratch + repo.img, hard-capped)
 − 120  (3 runner pods' own RAM emptyDirs: 3 × [work 24 + shared-tmp 16])
 −  50  (Windows VM 20 + in-guest full clone ~30, while it overlaps)
 −  20  (node baseline: etcd + ClickHouse + Postgres + control plane + OS)
 −  10  (page-cache margin)
 = ~100 GB free
```

The budget **closes with ~100 GB to spare** at `maxRunners: 3`. The old "≤3.5 GB per build or it doesn't close" squeeze was purely an artifact of the wrong 109 GB number.

**tmpfs ceiling — the constraint that actually binds:** within the 200 GB tmpfs, `engine 45 + mirror 7 = 52` fixed, leaving **~148 GB for `N × per_build_scratch`** → ~49 GB per build at `maxRunners: 3`. A UE cook's materialized project + `Saved/StagedBuilds` fits that comfortably; if a single project's peak scratch ever approached 49 GB you'd raise the ceiling (you have the node RAM), not lower concurrency.

## Scaling `maxRunners` beyond 3

`maxRunners` is a concurrency cap, not a correctness gate — over-subscription just **queues** (FIFO), it never corrupts. Plugin builds (`ci-unreal-plugins.yml`, auto on PRs touching `packages/unreal/**`, matrixed per plugin) and engine builds also land on `arc-runner-ue`, so they *can* coincide with a manually-dispatched game build. To let those run **concurrently** rather than queue:

| `maxRunners` | Covers | tmpfs ceiling needed (engine 45 + mirror 7 + N×~49 scratch) | Node-RAM check |
|---|---|---|---|
| 2 | server + game Linux | 150 GB | ✅ ~190 GB free |
| **3** | **+ one plugin _or_ engine Linux build (the chosen target)** | **200 GB (current)** | ✅ ~100 GB free |
| 4 | + plugin matrix overlap | ~250 GB | ⚠️ ~30 GB free — re-check before going here |

Rule: each extra concurrent Linux cook needs ~one more `per_build_scratch` (~49 GB) of tmpfs ceiling **and** one more runner emptyDir set (~40 GB node RAM). At `maxRunners: 4` / 250 GB ceiling the node-RAM free margin tightens to ~30 GB — validate peak scratch and baseline before going past 3.

## Decision rule

1. Ship at **`maxRunners: 3`**, tmpfs `size=200G` (already set in the DaemonSet).
2. Run §5 validation and fill the `MEASURE` cells — chiefly **peak `per_build_scratch` for the largest real project** — to confirm 3×scratch + engine + mirror stays under 200 GB. (This is a confirmation, not a go/no-go gate: at 500 GB you have room to raise the ceiling if a project is unexpectedly large.)
3. To raise concurrency further (4+), bump `maxRunners` **and** the tmpfs `size=` together per the table above; never raise `maxRunners` without giving the tmpfs the matching ceiling, or the shared store ENOSPCs mid-build. Past `maxRunners: 4` re-check the node-RAM sum (~30 GB free at 4).
4. The all-in-RAM decision stands — the engine base stays on tmpfs; with ~500 GB there is no reason to move `--data-root` to disk.

## Runtime guard (WS-2 deliverable — not a substitute for the gate)

The §4 pre-flight free-space check runs *before* the cook and cannot see peak scratch. A **runtime** alert is required so tmpfs pressure is caught before it reaches etcd. Shipped inert as `manifests/ue-ramdisk-tmpfs-alert.yaml` (a `PrometheusRule`, **not** added to `kustomization.yaml` until cutover). It fires when node `MemAvailable` or tmpfs free falls below margin during a build, naming the etcd-flap risk in the runbook so the on-call response is "kill the build / scale `maxRunners` to 1," not "investigate later."
