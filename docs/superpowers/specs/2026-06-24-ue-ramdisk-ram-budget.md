# WS-2 — RAM Budget Worksheet (UE shared-ramdisk)

**Companion to:** `2026-06-24-ue-ramdisk-shared-build-design.md` (§4 "Node RAM ceiling")
**Status:** Worksheet — **the `maxRunners: 2` gate.** Numbers marked `MEASURE` are unknown until the §5 validation run; do **not** flip `maxRunners` to 2 until the inequality below closes *with measured values and margin*.
**Node:** single Talos node, total physical RAM **≈109 GB**, shared by k8s control plane, etcd, ClickHouse, Postgres, the KubeVirt VM, and the ARC runner pods.

> This worksheet is inert: it changes nothing. It exists to be filled in during the validation run and to make the go/no-go on `maxRunners: 2` an explicit, evidenced decision rather than an assumption.

## Why "move scratch to the shared tmpfs" does NOT save RAM

The only RAM the design actually reclaims is **de-duplication**, not relocation:

- **Saved:** one engine image copy instead of two (~40 GB), and one repo mirror instead of per-build clones.
- **NOT saved:** per-build scratch (materialized project + cook output). Whether it lives in a per-pod `medium: Memory` emptyDir (`work` 24Gi, `shared-tmp` 16Gi in `values-ue.yaml`) or in the shared `/var/mnt/ramdisk` tmpfs, it is the **same physical RAM on the same one node**. A `sizeLimit` is a cap, not a reservation, so an empty emptyDir costs ~0 — but the bytes don't vanish, they move to the shared tmpfs and are counted there.

**Consequence:** the budget headroom created by this design ≈ the size of *one* engine copy (~40 GB). That is the entire margin `maxRunners: 2` has to fit into.

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
  < 109 GB   (with margin, not at the edge)
```

## Worksheet (fill during §5 validation)

| Term | Source / how to measure | Value |
|---|---|---|
| `engine_overlay_shared` | `du -sh /var/mnt/ramdisk/docker` after one pull; `docker system df` | `MEASURE` (spec assumes ~40 GB extracted) |
| `repo_mirror` | `du -sh /var/mnt/ramdisk/repo.git` | `MEASURE` (spec assumes ~7 GB) |
| `per_build_scratch` (peak) | `du -sh` of `/var/mnt/ramdisk/<run>-<job>/{project,output}` at cook peak; watch with `ramdisk-watch-kube.sh` | `MEASURE` — **the dominant unknown** |
| `N_runners` | `maxRunners` in `values-ue.yaml` | 1 today; 2 = the target |
| `VM_ram` | `vm-windows-builder.yaml` `domain.memory.limits` | 20 GiB |
| `repo_img` (Windows) | sized RO disk image on tmpfs (git + LFS); `du -sh /var/mnt/ramdisk/repo.img` | `MEASURE` — RAM only while VM up |
| `win_clone_copy` (Windows) | full plain clone in the guest's own work disk (objects + LFS, **not** deduped) | `MEASURE` — RAM only while VM up |
| `node_baseline` | node `free -g` with builds idle, VM off | `MEASURE` (est. 15–25 GB) |
| `page_cache_margin` | policy choice | ≥ 10 GB recommended |

## Worked sensitivity (illustrative, NOT a green light)

Plugging the spec's *assumed* fixed costs and solving for the scratch budget:

```
109  −  45 (engine)  −  7 (mirror)  −  20 (VM)  −  20 (baseline est.)  −  10 (margin)
   = 7 GB  available for  2 × per_build_scratch
   ⇒  per_build_scratch must be ≤ ~3.5 GB per Linux build
```

**A UE cook's materialized project + `Saved/StagedBuilds` output is routinely far larger than 3.5 GB.** So on these assumptions the budget **does not close at `maxRunners: 2` with the image in RAM.** That is the worksheet's headline risk, and it matches the design audit.

## Decision rule (hard gate)

1. Run §5 validation at **`maxRunners: 1`** first; measure every `MEASURE` cell, including peak scratch for the *largest* real project.
2. Compute the inequality with measured numbers + ≥10 GB margin.
3. **If it closes:** flip `maxRunners: 2`, set the hard tmpfs `size=` (WS-4) to the proven ceiling, and enable the alert below.
4. **If it does not close** (the likely case): keep `maxRunners: 1`. Per the design decision, do **not** silently move the image to disk; choices are (a) stay serialized at 1, or (b) re-open the "image `--data-root` on disk" tradeoff explicitly (spec §4, deferred benchmark). Either way it is a documented decision, not a drift.

## Runtime guard (WS-2 deliverable — not a substitute for the gate)

The §4 pre-flight free-space check runs *before* the cook and cannot see peak scratch. A **runtime** alert is required so tmpfs pressure is caught before it reaches etcd. Shipped inert as `manifests/ue-ramdisk-tmpfs-alert.yaml` (a `PrometheusRule`, **not** added to `kustomization.yaml` until cutover). It fires when node `MemAvailable` or tmpfs free falls below margin during a build, naming the etcd-flap risk in the runbook so the on-call response is "kill the build / scale `maxRunners` to 1," not "investigate later."
