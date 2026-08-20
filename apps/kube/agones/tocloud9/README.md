# ToCloud9 — cluster manifests

Clustered AzerothCore (WoW 3.3.5a) running as a test case for **raw-TCP ingress**
and **Agones fleet semantics**. The local Docker Compose lane that this was
derived from lives in `apps/agones/tocloud9`, and everything here was shaped by
what that lane proved.

Upstream ships its own Helm chart. We do not use it — see _Why not the chart_.

## Shape

| Piece                                     | Kind               | Why                                                                    |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `tocloud9-gateway`, `tocloud9-authserver` | **Fleet** ×2 each  | Player-facing. Static hostPorts 8085 / 3724 on the node address.       |
| nine microservices                        | Deployment ×1 each | Internal only, never player-facing, so no reason to be Agones-managed. |
| `tocloud9-worldserver`                    | **Fleet**          | Players never reach it directly; the gateway does. `portPolicy: None`. |
| `mysql`                                   | StatefulSet        | Shared by the whole fleet, so it sits outside it.                      |
| `nats`, `redis`                           | Deployment         | Event bus and registry/GUID storage.                                   |
| `tocloud9-db-import`                      | Job (Sync hook)    | Seeds the schema before the fleet scales.                              |
| `tocloud9-client-data`                    | Job + RWX PVC      | ~4GB of client data shared by every worldserver.                       |

## The two decisions worth knowing

**No `GameServerAllocation`.** ToCloud9's `servers-registry` is already the
allocator: each worldserver self-registers its pod IP, and the registry assigns
maps across the fleet and redirects players when one dies. Agones owns the pod
pool and nothing else. Adding an Agones allocation policy would fight it.

**AzerothCore has no Agones SDK.** It can never call `Ready()` or `Health()`
itself, so a GameServer would sit in `Scheduled` forever and the fleet would
never become ready. The `agones-bridge` sidecar does it: waits for the world
socket on 8085 to accept, marks the GameServer Ready, then beats Health until
the socket dies. It probes the socket rather than libsidecar's `/ready`, because
that endpoint returns a hardcoded `{"ready":true}` and says nothing about
whether maps have loaded.

## Before the first sync

```bash
./seal-credentials.sh     # writes mysql-sealed-secret.yaml + db-sealed-secret.yaml
```

Both sealed secrets derive from one generated password so they cannot drift.
Nothing starts without them — `tocloud9-db` carries every DSN in the stack.

Then register the Application in `apps/kube/kustomization.yaml`:

```yaml
- agones/tocloud9/application.yaml
```

## Sync ordering

Wave 1 runs `tocloud9-db-import` and `tocloud9-client-data` as Sync hooks; the
Fleet is wave 2. Both hooks carry `hook-delete-policy: BeforeHookCreation`,
without which the Jobs are immutable on resync and the Application wedges.

The first sync is slow — the client-data download is several GB and the schema
import takes minutes. A cold worldserver then needs **over ten minutes** to load
maps before it binds the world socket, which is why `health.initialDelaySeconds`
is 1800.

## Verified before writing this

Against the running compose stack and the same images:

- The worldserver runs as **uid 1000 with a read-only config** — all three DB
  pools open. `/repo/bin` is root-owned `0755` in the image, so it cannot write
  logs beside its binary; `AC_LOGS_DIR=/logs` plus an emptyDir handles that.
- `AC_*` env vars really do override config keys — the worldserver logs
  `Found config value 'LoginDatabaseInfo' from environment variable`.
- `gateway` and `servers-registry` both start as **uid 10001 with a read-only
  root filesystem**.
- `busybox` `nc -z` and `wget --post-data` both work, which is what the
  `agones-bridge` sidecar is built on. (`curl`'s `telnet://` blocks — do not use
  it for a TCP probe.)
- Two worldservers self-register with distinct pod IPs and the registry splits
  maps between them with no overlap, **unevenly** — 24/95, not round-robin.
  Do not size the fleet assuming an even split.

## Pins that must not drift

- **`acore/ac-wotlk-db-import:16.0.0-dev` — do not move to `:master`.**
  AzerothCore collapsed `creature.id1/id2/id3` into a single `id` column after
  the commit ToCloud9's worldserver is built against, so a HEAD world DB makes
  the worldserver abort at startup with `Unknown column 'id1' in 'field list'`.
  The permanent fix is to build upstream's own importer
  (`game-server/azerothcore/Dockerfile --target db-import`), which always
  matches the worldserver but compiles all of AzerothCore.
- **`ghcr.io/walkline/*:master`** rather than the chart's `:v0.0.4`. That is the
  combination verified end to end. Note the two config namespaces: the Go
  services read bare env names, the worldserver's C++ libsidecar reads `TC9_*`.
  The Fleet sets both so neither falls back to a localhost default.
- **Client data `v20.0`** matches upstream, but its mmaps are generator v20
  while the pinned core expects v19 — the worldserver logs a mismatch per tile
  and runs without server-side pathfinding. Harmless for a networking test,
  wrong for real gameplay. `v19` is the matching release, untested here.

## Why not the chart

Upstream's chart renders 50 valid objects, but it has **zero extension
points** — no `extraContainers`, `extraEnv`, `sidecar`, `podAnnotations`,
`nodeSelector`, `tolerations`, or `securityContext` in all 192 lines of values.
The `agones-bridge` sidecar alone cannot be expressed through it, and ArgoCD
cannot kustomize-patch a Helm chart in a single source. It also renders
`resources: null` on every workload (the template reads `.Values.resources`,
which values.yaml never defines) and defaults `storageClassName` to a
placeholder. It remains a useful reference for env wiring, which is where its
influence on these manifests ends.

## Known gaps

- **Node addresses must be publicly routable.** `PREFERRED_HOSTNAME` is taken
  from `status.hostIP`, so each gateway advertises the node it landed on. If
  node addresses are private, override it with an explicit public value.
- **The fleets are capped by node count.** A static hostPort binds once per
  node, so `replicas` above the number of eligible nodes leaves GameServers
  stuck unscheduled.
- Longhorn RWX routes through a share-manager, a single point of failure for
  the whole fleet. If this ever carries players, bake the client data into the
  worldserver image instead — it is immutable and identical per pod.
- MySQL is a plain StatefulSet with no backups. It is also the first MySQL
  workload in the cluster; ToCloud9 cannot use kilobase/CNPG, because the
  worldserver is C++ against libmysqlclient, every Go repo is `*_mysql.go`, and
  `apps/mysqlreverseproxy` parses the MySQL wire protocol directly.

## The external lane

Players reach the cluster on **node addresses via static hostPorts** — the same
model factorio (34197) and palworld (8211) use, and no LoadBalancer IP is
consumed.

| Port     | Fleet                 | Why this port                                                                                                      |
| -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 3724 TCP | `tocloud9-authserver` | Fixed by the 3.3.5a protocol. `set realmlist <host>` dials 3724 and the client offers no way to change it.         |
| 8085 TCP | `tocloud9-gateway`    | World traffic. Not fixed by the protocol — authserver tells the client where to go — but pinned anyway, see below. |

Discovery is DNS, exactly as for `factorio.kbve.com`: point `tocloud9.kbve.com`
at the public IP of the dedicated-server node the fleets land on. The Agones
chart's global `nodeSelector` (`node.kbve.com/type: dedicated-server`) already
keeps them there, so no per-fleet affinity is needed.

Players then use `set realmlist tocloud9.kbve.com` and log in with the
`admin` / `admin` account seeded by the SQL deltas.

### Three constraints that follow

**Neither port is privileged.** Both are above 1024, so no
`CAP_NET_BIND_SERVICE` — every container keeps `runAsNonRoot`, a read-only root
filesystem, and `capabilities: drop: [ALL]`. The `privileged` PSA label is
needed _only_ because PodSecurity baseline forbids the `hostPort` field itself.

**`replicas: 1`, not more.** A static hostPort binds once per node, so each
fleet is capped by the number of dedicated-server nodes. Set higher and the
extra GameServers sit unschedulable forever. Raise it only alongside node count.

**Rollouts are `maxSurge: 0` / `maxUnavailable: 1`.** Inverted from the usual
surge-first rollout, because a replacement pod cannot bind the hostPort until
the old one releases it. Surging first deadlocks on a single node. This means a
brief connection outage on every gateway/authserver update — acceptable here,
and the reason the worldserver fleet (which has no hostPort) keeps the normal
surge-first strategy.

### Why Static and not Dynamic

The gateway advertises itself to servers-registry as
`PREFERRED_HOSTNAME + ":" + PORT`, using the port it _listens_ on rather than
whatever hostPort Agones assigned — verified against a live registry record
(`127.0.0.1:8085`) and `gateway/cmd/gateway/main.go:registerGateway`. Under
`Dynamic`, Agones would map a node port in 7000-7900 to containerPort 8085 and
the gateway would still tell clients 8085, sending them to a port nothing is
listening on. `Static` with `hostPort == containerPort` is the only policy that
keeps the advertised address truthful.

Factorio's README notes the same trade-off from the other direction: a fleet of
more than one _should_ move to `Dynamic` with a lobby endpoint proxying the
allocation. ToCloud9 already has that lobby — it is `authserver`, which serves
live gateway addresses out of servers-registry. Making `Dynamic` work would
require the gateway to advertise its assigned hostPort rather than its listen
port, which it has no config for today.

### Why not a shared LoadBalancer

The cluster has exactly one public IP, `142.132.206.71/32`. Cilium only permits
sharing it when every participant lists the others in
`sharing-cross-namespace`, so adding ToCloud9 would mean editing three live
production services (`kbve-gateway`, `arpg-game-udp`, `friendslop-game-udp`) —
and an inconsistent sharing list is what causes LB-IPAM address theft. The
hostPort lane needs none of that.

## Metrics

Both fleets serve Prometheus on their health port, scraped by the PodMonitors in
`manifests/podmonitor.yaml`:

| Source      | Endpoint        | Series                                                                          |
| ----------- | --------------- | ------------------------------------------------------------------------------- |
| worldserver | `:8901/metrics` | `active_connections`, `delay_95_percentile`, `delay_99_percentile`, `delay_max` |
| gateway     | `:8900/metrics` | `active_connections` plus Go runtime metrics                                    |

The `release: monitoring` label on each PodMonitor is mandatory — Prometheus
selects on it, and one without it is never scraped, with no error to show for it.

The worldserver's `delay_*` gauges are server tick time, and they are the only
signal that catches a worldserver which has not crashed but is falling behind.
The Agones health check cannot see that: it only proves the socket still accepts.

## Registering with Agones

`tocloud9` must appear in `gameservers.namespaces` in
`apps/kube/agones/values.yaml` — that is where the chart creates the
`agones-sdk` ServiceAccount. Without it a GameServer goes straight to Error
with `serviceaccount "agones-sdk" not found` and the GameServerSet respawns it
every 30 seconds forever. This branch adds it.
