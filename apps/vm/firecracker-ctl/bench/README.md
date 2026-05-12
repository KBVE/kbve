# firecracker-ctl boot-timing benchmark

Cold-start harness that compares the baked-rootfs tier
(`firecracker-python-web`, `firecracker-node-web`) against the
lightweight `alpine-python` / `alpine-node` + pip/npm cache tier.

## What it does

For each scenario it:

1. `POST /api/v1/fc/deploy` with a minimal FastAPI / Fastify hello-world
2. Polls `/api/v1/fc/<name>/health` until 200 or `READY_TIMEOUT_S` (default 30s)
3. `DELETE /api/v1/fc/<name>` to clean up
4. Prints `deploy_ms` (API hop), `ready_ms` (boot → HTTP ready), `total_ms`

## Run

```bash
export KBVE_API=https://kbve.com   # or http://127.0.0.1:4321 for local
export KBVE_TOKEN=<staff-jwt>      # access_token with DASHBOARD_MANAGE
./apps/vm/firecracker-ctl/bench/boot-timing.sh
```

Optional:

```bash
ROUNDS=3 ./boot-timing.sh           # repeat each scenario 3x for averaging
READY_TIMEOUT_S=60 ./boot-timing.sh # extend ready timeout
PORT=9090 ./boot-timing.sh          # different listen port inside the VM
```

## Output shape

```
rootfs                         packages       deploy_ms   ready_ms   total_ms
firecracker-python-web         -                    180       2310       2490
alpine-python                  fastapi uvicorn      210       9450       9660
firecracker-node-web           -                    190       1820       2010
alpine-node                    fastify              200       7110       7310
```

`ready_ms` is the meaningful metric: it captures kernel boot + init
script + package install (cache tier only) + FastAPI/Fastify cold start
until `/health` returns 200.

## Requires

- `curl`, `jq`, `python3` on the host
- A staff JWT (paste from the dashboard or `/api/v1/auth/...`)
- Firecracker-ctl-net deployed with the rootfs flavours present on the
  `firecracker-rootfs` PVC
