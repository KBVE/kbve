# Firecracker MicroVM Runtime — Design Document

## Overview

Extend the KBVE edge platform with Firecracker microVM support, enabling edge
functions and a browser-based IDE to dispatch workloads into hardware-isolated
virtual machines with sub-second boot times (~125 ms) and minimal overhead
(~5 MB per VMM process).

## Architecture

```
Browser (dashboard/ide/)
  ┌──────────────────────────┐
  │ CodeMirror 6 Editor      │  Python / JavaScript / Shell
  ├──────────────────────────┤
  │ [Run]  preset selector   │  Configurable timeout/memory/vCPU
  ├──────────────────────────┤
  │ stdout / stderr / stats  │  Execution history (last 20 runs)
  └──────────────────────────┘
           │ /dashboard/firecracker/proxy/*
           ▼
  ┌──────────────────────────┐     ┌──────────────────────────┐
  │ axum-kbve (kbve ns)      │     │ Edge Runtime (kilobase)  │
  │ JWT auth + proxy         │     │ Deno workers (Tier 1)    │
  └──────────────────────────┘     └──────────────────────────┘
           │                                │
           └────────────┬───────────────────┘
                        ▼ HTTP :9001
           ┌──────────────────────────┐
           │ firecracker-ctl           │  Rust Axum REST API
           │ (firecracker ns)          │  /dev/kvm via device plugin
           │ ┌────┐ ┌────┐ ┌────┐    │
           │ │VM1 │ │VM2 │ │VM3 │    │  alpine-python / alpine-node / alpine-minimal
           │ └────┘ └────┘ └────┘    │
           └──────────────────────────┘
```

### Two-tier isolation model

| Tier | Isolation   | Boot   | Use Case                           |
| ---- | ----------- | ------ | ---------------------------------- |
| 1    | V8 isolates | ~10ms  | TypeScript edge functions          |
| 2    | Firecracker | ~125ms | Arbitrary binaries, untrusted code |

## Components

### firecracker-ctl (Rust Axum)

- **Source:** `apps/vm/firecracker-ctl/`
- **Image:** `ghcr.io/kbve/firecracker-ctl`
- **API:** `GET /health`, `POST /vm/create`, `GET /vm`, `GET /vm/{id}`, `GET /vm/{id}/result`, `DELETE /vm/{id}`
- **Dockerfile:** chisel-ubuntu-axum builder + Firecracker v1.10.1 binary + jailer

### Kubernetes (firecracker namespace)

- **Manifests:** `apps/kube/firecracker/manifests/`
- **Namespace:** `firecracker` (privileged PodSecurity for KVM + NET_ADMIN)
- **Deployment:** `devices.kubevirt.io/kvm: 1`, `nodeSelector: kvm: true`
- **NetworkPolicy:** Default-deny + ingress from kilobase/functions and kbve/app:kbve only, egress DNS-only
- **PVC:** 2Gi Longhorn for rootfs images + vmlinux kernel
- **Init Job:** Builds alpine-minimal/python/node ext4 images + downloads vmlinux in-cluster
- **KEDA:** Scale-to-zero outside business hours, CPU-based scale-out

### Rootfs Images

Built in-cluster by the init Job (`alpine:3.21` + `e2fsprogs` + `mkfs.ext4`):

| Image            | Size   | Contents          |
| ---------------- | ------ | ----------------- |
| `alpine-minimal` | ~8 MB  | Alpine + busybox  |
| `alpine-python`  | ~45 MB | Alpine + Python 3 |
| `alpine-node`    | ~40 MB | Alpine + Node.js  |

### Dashboard IDE (`/dashboard/ide/`)

- **CodeMirror 6** editor with Python/JavaScript/Shell syntax switching
- **Preset inventory:** 6 presets (Python Quick/Standard/Heavy, Node.js Quick/Standard, Shell)
- **Execution history:** Last 20 runs with click-to-reload
- **Proxy:** axum-kbve `/dashboard/firecracker/proxy/*` → firecracker-ctl

### Dashboard VM Panel (`/dashboard/vm/`)

- Firecracker section shows service health, version, active VM cards
- Alongside KubeVirt and KASM panels

### Edge Function Integration

- `_shared/firecracker.ts` client library
- OWS function `firecracker.*` commands (status, create, list, destroy)
- `FIRECRACKER_URL` env wired in functions deployment

### Observability

- **Vector:** `firecracker` route → ClickHouse `observability.logs_raw`
- **ClickHouse:** `firecracker.vm_events` + `vm_stats_1m` materialized view
- **E2E tests:** `edge-e2e/e2e/firecracker.spec.ts`

### CI/CD

- CI dispatch manifest entry (`firecracker_ctl`)
- Docker build: chisel-ubuntu-axum builder + sccache
- Version gated via `version.toml`

## Security

- Firecracker namespace: `privileged` PodSecurity (KVM + NET_ADMIN)
- Default-deny NetworkPolicy: all pods start with zero network access
- firecracker-ctl egress: DNS only (no access to databases, Supabase, secrets)
- Ingress: only kilobase/functions + kbve/app:kbve on port 9001
- Firecracker jailer: cgroup + seccomp + chroot per VM
- Read-only rootfs with tmpfs overlay
- Staff-only dashboard permission required

## Completed Phases

- **Phase 1:** Design document, K8s manifests, ArgoCD app
- **Phase 2:** Edge function client, env wiring, documentation (edge.mdx, kubernetes.mdx)
- **Phase 3:** OWS integration, e2e tests, ClickHouse schema, KEDA scaling
- **Phase 4:** firecracker-ctl binary, Dockerfile, rootfs Dockerfiles, Nx project
- **Phase 5:** CI pipeline, ArgoCD registration, Vector routing, vmlinux init Job
- **Phase 6:** Dedicated namespace (privileged), NetworkPolicy hardening, Talos kvm label
- **Phase 7:** Dashboard VM panel, Firecracker cards component
- **Phase 8:** Browser IDE (CodeMirror, preset inventory, execution history)
- **Phase 9:** Rootfs init Job rewrite (build ext4 in-cluster), Docker build fixes

## Remaining Work

- [ ] TAP networking (deferred — MMDS sufficient for current workloads)
- [ ] Warm VM pool (pre-booted VMs for <50ms dispatch)
- [ ] Multi-node scheduling
- [ ] Additional rootfs images (ubuntu-rust, alpine-go)
- [ ] File upload to VMs (code injection via MMDS instead of env vars)
- [ ] IDE: real-time streaming output (WebSocket)
- [ ] IDE: file tree / multi-file support
