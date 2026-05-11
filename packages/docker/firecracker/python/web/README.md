# firecracker-python-web

FastAPI-ready Python rootfs for Firecracker microVMs.

## What's baked

- Alpine 3.21 + Python 3.12
- `py3-pip`, `py3-requests`, `py3-httpx`, `py3-urllib3`, `py3-certifi` (apk)
- `fastapi`, `uvicorn`, `starlette`, `python-multipart`, `email-validator`, `websockets`, `anyio`, `sniffio`, `h11`, `click` (pip, musllinux wheels)
- `ca-certificates-bundle`, `ca-certificates`, `iproute2`
- `/etc/resolv.conf` with `1.1.1.1` and `8.8.8.8`
- `/init` that mounts `/proc`, `/sys`, `/dev`, brings up `lo` + `eth0`, then `exec /entrypoint`

## When to use

This image pairs with the **net deployment** (`firecracker-ctl-net`, `FC_PERSISTENT_ENDPOINTS_ENABLED=true`). It is intended for **long-lived FastAPI deploys** submitted through the dashboard IDE — week-to-month TTL endpoints that need the server libraries available immediately at boot, without a per-deploy `pip install` hop.

For short-lived runs or arbitrary dependency sets, the cheaper path is the existing `alpine-python` rootfs plus the shared pip-cache (which now carries `fastapi` + `uvicorn` thanks to #10828). For sandbox quick-mode VMs with no network, keep using the no-network `alpine-python` rootfs.

## Output

- Container image: `ghcr.io/kbve/firecracker-python-web:<version>` (alpine layer carrying `/rootfs.ext4` with a `cp` entrypoint)
- Extracted ext4 (via `nx run firecracker-python-web:extract`): `dist/python-web.ext4`

## Build

```bash
npx nx run firecracker-python-web:container
npx nx run firecracker-python-web:extract
```

## Publish

```bash
npx nx run firecracker-python-web:container:production
```

Pushes `ghcr.io/kbve/firecracker-python-web:latest` and `:<version>`.
