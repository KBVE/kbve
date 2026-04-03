# Firecracker MicroVM Runtime — Design Document

## Overview

Extend the KBVE edge platform with Firecracker microVM support, enabling edge
functions to dispatch workloads into hardware-isolated virtual machines with
sub-second boot times (~125 ms) and minimal overhead (~5 MB per VMM process).

## Problem

The current Supabase edge-runtime provides Deno V8 worker isolation (150 MB
memory, 60 s timeout). This is sufficient for TypeScript functions but cannot
run arbitrary binaries, long-running processes, or untrusted code that requires
full OS-level isolation.

## Architecture

```
                    ┌──────────────────────────────────┐
                    │        Edge Runtime Pod           │
                    │   (supabase/edge-runtime:v1.73)   │
                    │                                    │
                    │  Deno workers (Tier 1 — isolates)  │
                    │    health, meme, vault, argo ...   │
                    └────────────┬─────────────────────┘
                                 │ HTTP/gRPC (internal)
                                 ▼
                    ┌──────────────────────────────────┐
                    │     Firecracker Service Pod       │
                    │   (kbve/firecracker-ctl:latest)   │
                    │                                    │
                    │  REST API → Firecracker VMM        │
                    │  /dev/kvm mounted via device plugin │
                    │                                    │
                    │  Tier 2 — microVM workloads        │
                    │  ┌─────┐ ┌─────┐ ┌─────┐         │
                    │  │ VM1 │ │ VM2 │ │ VM3 │         │
                    │  └─────┘ └─────┘ └─────┘         │
                    └──────────────────────────────────┘
```

### Two-tier isolation model

| Tier | Isolation   | Boot   | Use Case                           |
| ---- | ----------- | ------ | ---------------------------------- |
| 1    | V8 isolates | ~10ms  | TypeScript edge functions          |
| 2    | Firecracker | ~125ms | Arbitrary binaries, untrusted code |

### Communication flow

1. Edge function receives HTTP request
2. For VM-eligible workloads, the function POSTs to the Firecracker service
3. Firecracker service creates/reuses a microVM
4. microVM executes the workload and returns result
5. Edge function forwards response to caller

## Infrastructure Requirements

### Node requirements

- Linux kernel with KVM support (Intel VT-x / AMD-V)
- `/dev/kvm` exposed via Kubernetes device plugin
    - Option A: `kubevirt/device-plugin-kvm` (already in cluster for KubeVirt)
    - Option B: `smarter-project/smarter-device-manager`
- Bare metal nodes preferred (nested virt adds latency)

### Kubernetes resources

- **Namespace:** `kilobase` (co-located with edge-runtime)
- **Device plugin:** KVM device request in pod spec
- **Node affinity:** Schedule on nodes with `kvm=true` label
- **RBAC:** Minimal — only needs KVM device access, no cluster-admin

### Firecracker service pod spec (draft)

```yaml
containers:
    - name: firecracker-ctl
      image: ghcr.io/kbve/firecracker-ctl:latest
      resources:
          requests:
              cpu: 250m
              memory: 512Mi
              devices.kubevirt.io/kvm: '1'
          limits:
              cpu: '2'
              memory: 2Gi
              devices.kubevirt.io/kvm: '1'
      securityContext:
          capabilities:
              add: ['NET_ADMIN'] # for TAP device networking
      volumeMounts:
          - name: rootfs-cache
            mountPath: /var/lib/firecracker/rootfs
```

## Integration Paths (evaluated)

### Path 1: Kata Containers (rejected)

- Transparent CRI integration — every pod gets VM isolation
- Too coarse-grained; we want selective VM dispatch, not all-pods-in-VMs
- Adds latency to pods that don't need VM isolation

### Path 2: Custom Firecracker service (selected)

- Dedicated service with REST API
- Edge functions call it explicitly for VM workloads
- Fine-grained control over rootfs images, networking, lifecycle
- Clean separation of concerns

### Path 3: Fork Supabase edge-runtime (rejected)

- Maximum integration but high maintenance burden
- Couples VM lifecycle to Deno process — failure domains overlap
- Upstream updates become painful to rebase

## API Design (draft)

### POST /vm/create

```json
{
	"rootfs": "alpine-minimal",
	"vcpu_count": 1,
	"mem_size_mib": 128,
	"boot_args": "console=ttyS0 reboot=k panic=1",
	"timeout_ms": 30000,
	"env": { "TASK": "compute", "INPUT": "..." },
	"entrypoint": "/usr/local/bin/worker"
}
```

### Response

```json
{
	"vm_id": "fc-a1b2c3",
	"status": "running",
	"created_at": "2026-04-02T12:00:00Z"
}
```

### GET /vm/{vm_id}/result

Returns the stdout/stderr and exit code once the VM completes.

### DELETE /vm/{vm_id}

Force-terminates a running VM.

## Rootfs Images

Pre-built minimal root filesystems stored as OCI artifacts in GHCR:

| Image            | Size    | Contents                             |
| ---------------- | ------- | ------------------------------------ |
| `alpine-minimal` | ~8 MB   | Alpine + busybox, no package manager |
| `alpine-python`  | ~45 MB  | Alpine + Python 3.12 minimal         |
| `alpine-node`    | ~40 MB  | Alpine + Node.js 22 LTS              |
| `ubuntu-rust`    | ~120 MB | Ubuntu minimal + Rust toolchain      |

## Networking

- **Option A (simple):** No networking — stdin/stdout pipe via MMDS (Firecracker metadata service)
- **Option B (advanced):** TAP device with CNI bridge — microVM gets a routable IP

Start with Option A (MMDS) — sufficient for request/response workloads. Graduate to TAP networking when persistent connections or service-to-service calls are needed.

## Security

- Firecracker's jailer enforces cgroup + seccomp + chroot per VM
- No root inside microVMs — drop all capabilities
- Read-only rootfs with tmpfs overlay for scratch space
- Network policy: only allow traffic from edge-runtime pods
- VM timeout enforced both client-side (edge function) and server-side (firecracker-ctl)

## Phased Rollout

### Phase 1: Foundation (complete)

- [x] Design document (this file)
- [ ] Firecracker binary packaging (Dockerfile)
- [x] Kubernetes manifests (deployment, service, PVC, NetworkPolicy)
- [ ] Health check endpoint

### Phase 2: Core API & Integration (complete)

- [ ] VM lifecycle API (create, status, result, delete)
- [ ] MMDS-based stdin/stdout communication
- [ ] Alpine-minimal rootfs build pipeline
- [x] Edge function client library (`_shared/firecracker.ts`)
- [x] FIRECRACKER_URL env wired in functions-deployment.yaml
- [x] Main router env allowlist updated for `ows` function
- [x] Documentation: edge.mdx expanded with Firecracker design
- [x] Documentation: kubernetes.mdx Firecracker reference section

### Phase 3: Integration (complete)

- [x] Wire edge function → Firecracker via OWS module (`ows/firecracker.ts`)
- [x] E2E tests (`edge-e2e/e2e/firecracker.spec.ts`)
- [x] ClickHouse schema (`firecracker.vm_events` + `vm_stats_1m` materialized view)
- [x] KEDA ScaledObject (cron + CPU-based autoscaling, scale-to-zero)

### Phase 4: Production (complete)

- [x] `firecracker-ctl` Rust Axum binary (`apps/vm/firecracker-ctl/`)
- [x] Dockerfile with Firecracker v1.10.1 binary + jailer
- [x] Nx project.json with build/test/lint/container targets
- [x] Registered in workspace Cargo.toml
- [x] Rootfs Dockerfiles: alpine-minimal, alpine-node, alpine-python

### Phase 5: Deployment & CI (current)

- [x] CI dispatch manifest entry (`firecracker_ctl` in `ci-dispatch-manifest.json`)
- [x] ArgoCD application registered in `kustomization.yaml`
- [x] Vector log routing for `firecracker-ctl` → ClickHouse
- [x] vmlinux kernel download script + K8s init Job (PostSync hook)
- [x] version.toml for CI pipeline version gating
- [ ] Node label `kvm=true` (requires manual kubectl — see deployment notes)
- [ ] TAP networking (deferred — MMDS sufficient for now)
- [ ] Warm pool (pre-booted VMs for <50ms dispatch)
- [ ] Multi-node scheduling
