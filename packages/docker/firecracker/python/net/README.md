# firecracker-python-net

Network-capable Python rootfs for Firecracker microVMs.

## What's baked

- Alpine 3.21 + Python 3.12
- `py3-pip`, `py3-requests`, `py3-httpx`, `py3-urllib3`, `py3-certifi`
- `ca-certificates-bundle`, `ca-certificates`, `iproute2`
- `/etc/resolv.conf` with `1.1.1.1` and `8.8.8.8`
- `/init` that mounts `/proc`, `/sys`, `/dev`, brings up `lo` + `eth0`, then `exec /entrypoint`

## When to use

This image pairs with the **net deployment** (`firecracker-ctl-net`, `FC_PERSISTENT_ENDPOINTS_ENABLED=true`). It is intended for staff-deployed persistent endpoints that need outbound HTTP.

For sandbox quick-mode VMs (no network, public exec), keep using the no-network `alpine-python` rootfs in [apps/vm/firecracker-ctl/rootfs/Dockerfile.alpine-python](../../../../../apps/vm/firecracker-ctl/rootfs/Dockerfile.alpine-python).

## Output

- Container image: `ghcr.io/kbve/firecracker-python-net:<version>` (scratch image carrying `/rootfs.ext4`)
- Extracted ext4 (via `nx run firecracker-python-net:extract`): `dist/python-net.ext4`

## Build

```bash
npx nx run firecracker-python-net:container
npx nx run firecracker-python-net:extract
```

## Publish (CI)

```bash
npx nx run firecracker-python-net:container:production
```

Pushes `ghcr.io/kbve/firecracker-python-net:latest` and `:<version>`.
