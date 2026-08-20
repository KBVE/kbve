# ToCloud9 — Agones / networking test case

[ToCloud9](https://github.com/walkline/ToCloud9) turns AzerothCore (WoW 3.3.5a) into a
clustered, horizontally scalable set of microservices. It is used here as a **test case for
raw-TCP ingress and Agones fleet semantics** — not as a shipped KBVE game.

This directory is the **local Docker Compose lane**. Cluster manifests are not written yet.

## Attribution

ToCloud9 is © 2021 walkline, MIT licensed. The files under `sql/auth/` and `sql/characters/`
are copied verbatim from that repository; everything else here is KBVE glue. No ToCloud9 code
is built in this directory — all images are pulled from `ghcr.io/walkline/*`.

## Why it is a good test case

| Concern              | What ToCloud9 exercises                                                                                                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Networking (primary) | The WoW client speaks **raw TCP**, not HTTP. `authserver` on `3724` and `gateway` on `8085` need a TCPRoute / LB-IPAM lane, which nothing else in this repo uses — every other service rides HTTPRoute.                                                                                                                       |
| Agones               | `gameserver-ac` (worldserver) takes its advertised address from its own pod IP and self-registers with `servers-registry`, which then load-balances maps across worldservers and redirects players when one dies. That is a `Fleet` with `portPolicy: None` — same shape as `apps/kube/agones/herbmail/manifests/fleet.yaml`. |
| Allocation           | **No `GameServerAllocation`.** ToCloud9's own `servers-registry` is the allocator; Agones only owns the pod pool. Worth proving that hybrid works before committing to it elsewhere.                                                                                                                                          |

## Layout

```
docker-compose.yml   upstream ghcr.io/walkline images only — nothing is built here
.env.example         copy to .env (the `env` target does it for you)
sql/init/            MySQL bootstrap: acore user + three empty databases
sql/auth/            ToCloud9 auth-DB delta (seeds the admin:admin account)
sql/characters/      ToCloud9 characters-DB deltas (guild/group invites, channels, mail)
e2e/                 vitest network probes
```

## Services

`gateway` + `gateway-second` (packet-inspecting API gateway, world ports 8085/8045),
`authserver` (3724), `servers-registry` (8999), `charserver`, `chatserver`, `guildserver`,
`guidserver`, `mailserver`, `groupserver`, `auctionhouse`, `matchmakingserver`, and
`gameserver-ac` (the AzerothCore worldserver). Backing stores: MySQL 8.4, NATS 2.10, Redis 7.2.

## Running it

```bash
./kbve.sh -nx agones-tocloud9:setup   # one-time: schema import + ~3.5GB client data
./kbve.sh -nx agones-tocloud9:up      # start the cluster
./kbve.sh -nx agones-tocloud9:e2e     # network + cluster-membership probes
./kbve.sh -nx agones-tocloud9:scale   # TC9_WORLDSERVERS=3 to rehearse a Fleet
./kbve.sh -nx agones-tocloud9:down    # stop (nuke also drops volumes)
```

`setup` is slow and mostly network-bound: it pulls the AzerothCore world DB and the
`wowgaming/client-data` v20 `Data.zip`. Both land in named volumes and are skipped on reruns.

To connect a real 3.3.5a client, point `realmlist.wtf` at `set realmlist 127.0.0.1` and log in
as `admin` / `admin`.

## Notes and known risks

- **No image is built here.** All ToCloud9 images come from `ghcr.io/walkline/*` and are pinned
  by `TC9_IMAGE_TAG` (default `master`). They publish `linux/amd64` **and** `linux/arm64`, so
  everything runs native on Apple Silicon.
- **`ac-db-import` is amd64-only** and is therefore pinned to `platform: linux/amd64`. It runs
  under emulation. It is a one-shot setup job, so the cost is paid once.
- **Schema drift is the real constraint, and it already bit once.** ToCloud9's worldserver is
  built against a pinned AzerothCore commit (`0c0a332`, 2026-08-15), while
  `acore/ac-wotlk-db-import:master` tracks AzerothCore HEAD. With `master` the worldserver dies
  at startup:

    ```
    In mysql_stmt_prepare() id: 61, sql: "INSERT INTO creature (guid, id1, id2, id3, ...)"
    Unknown column 'id1' in 'field list'
    Could not prepare statements of the World database
    ```

    AzerothCore collapsed `creature.id1/id2/id3` into a single `id` between Aug 15 and Aug 19, so
    a HEAD world DB is already too new for the pinned worldserver. `AC_DB_IMPORT_IMAGE` therefore
    pins an older importer rather than `master`. **Do not bump it to `master`** without
    re-running `setup` and confirming the worldserver still reaches map loading.

    The fully correct fix is to compile the importer from ToCloud9's own tree, which guarantees
    the schema matches the worldserver binary:

    ```bash
    # from a ToCloud9 checkout
    docker build -t tc9-db-import --target db-import -f game-server/azerothcore/Dockerfile .
    ```

    then set `AC_DB_IMPORT_IMAGE=tc9-db-import`. That target compiles all of AzerothCore, so it
    costs roughly an hour — worth it for CI, too slow for the local loop, which is why the
    pinned upstream importer is the default here.

- `TC9_IMAGE_TAG=master` is a moving tag. The newest tag where _every_ service including
  `gameserver-ac` agrees is `v0.0.4`, but that predates the current env-var naming
  (`TC9_NATS_URL` vs `NATS_URL`), so this compose file targets `master` instead.
- `gameserver-ac` publishes no host ports on purpose — players reach it through `gateway`.
  That mirrors the `portPolicy: None` Fleet shape it would take in-cluster.

- **MMap generator mismatch.** The pinned core expects mmap generator v19, but client-data
  `v20.0` (what upstream ToCloud9 pins) ships v20 tiles, so the worldserver logs
  `MMAP:loadMap: ... was built with generator v20, expected v19` for every tile and runs
  without server-side pathfinding. Harmless for a networking/Agones test, wrong for actual
  gameplay. `CLIENT_DATA_URL` is configurable; the matching release is `v19`. Left on `v20.0`
  for upstream parity — **untested on `v19`**, and swapping it re-downloads ~3.5GB.

## What the e2e probes assert

- `auth-tcp.spec.ts` — opens TCP `3724` and sends a real 3.3.5a `AUTH_LOGON_CHALLENGE`,
  asserting the server answers with a success opcode and SRP payload.
- `gateway-tcp.spec.ts` — opens both world ports and asserts the gateway pushes
  `SMSG_AUTH_CHALLENGE` unprompted, which is what proves the raw-TCP lane end to end.
- `cluster.spec.ts` — reads `ws:*` / `gw:*` out of Redis to confirm each worldserver and
  gateway self-registered, that the advertised address, gRPC address and health-check address
  are all routable (never loopback), and that **no map is claimed by two worldservers**. These
  are the checks that carry over unchanged to an Agones Fleet.

## Verified locally

Everything below was observed on an arm64 Mac against this compose file, worldservers scaled
to two:

```
ID 3339987501  addr 192.168.97.17:8085  grpc :9509  health :8901  maps 24
ID  617017446  addr 192.168.97.18:8085  grpc :9509  health :8901  maps 95
```

- 10/10 e2e probes pass.
- The registry rebalanced maps across both worldservers with no overlap, which is the property
  a Fleet needs. Note it hands out an **uneven** split (24/95), not a round-robin.
- Each worldserver advertises a per-container IP with a **dedicated health-check port (8901)** —
  that port is the natural binding point for the Agones SDK health loop.
- Gateways register themselves under `gw:*` independently of the worldservers, so the external
  TCP lane and the game-server pool scale separately.

## If this graduates to the cluster

Sketch, not yet written:

- `Fleet` for `gameserver-ac` with `portPolicy: None` (players arrive via `gateway`, never
  directly), `TC9_PREFERRED_HOSTNAME` from `status.podIP`, and Agones health pointed at `8901`.
- Plain `Deployment`s for the eleven stateless microservices — they are not game servers and
  should not be Agones-managed.
- The external lane is the open question: `authserver:3724` and `gateway:8085` are raw TCP, so
  they need Cilium `TCPRoute` or an LB-IPAM `Service`, not the `HTTPRoute` pattern used
  everywhere else in this repo. That is the part actually worth testing.
- **No `GameServerAllocation`.** `servers-registry` already allocates; Agones would only own
  the pod pool. Any allocation policy added on the Agones side would fight it.
