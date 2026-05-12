# firecracker-node-web

Fastify-ready Node rootfs for Firecracker microVMs.

## What's baked

- Alpine 3.21 + Node.js 22 LTS + npm
- `fastify`, `@fastify/cors`, `@fastify/helmet`, `@fastify/static`, `undici`, `zod`, `pino`, `pino-pretty`, `dotenv`, `nanoid`, `date-fns`, `commander`, `chalk` resolved into `/usr/lib/node_modules`
- `ca-certificates-bundle`, `ca-certificates`, `iproute2`
- `/etc/resolv.conf` with `1.1.1.1` and `8.8.8.8`
- `/init` mounts `/proc`, `/sys`, `/dev`, brings up `lo` + `eth0`, exports `NODE_PATH=/usr/lib/node_modules`, then `exec /entrypoint`

## When to use

This image pairs with the **net deployment** (`firecracker-ctl-net`, `FC_PERSISTENT_ENDPOINTS_ENABLED=true`). It is the **long-lived deploy** rootfs for Node endpoints submitted through the dashboard IDE — week-to-month TTL VMs where paying a build-time `npm install` is the right tradeoff for instant boot.

For short-lived runs the cheaper path is the existing `alpine-node` rootfs plus the shared `npm-cache.ext4` drive (which carries the same Fastify stack via the `firecracker-npm-packages` ConfigMap).

## Output

- Container image: `ghcr.io/kbve/firecracker-node-web:<version>` (alpine layer carrying `/rootfs.ext4` with a `cp` entrypoint)
- Extracted ext4 (via `nx run firecracker-node-web:extract`): `dist/node-web.ext4`

## Build

```bash
npx nx run firecracker-node-web:container
npx nx run firecracker-node-web:extract
```

## Publish

```bash
npx nx run firecracker-node-web:container:production
```

Pushes `ghcr.io/kbve/firecracker-node-web:latest` and `:<version>`.
