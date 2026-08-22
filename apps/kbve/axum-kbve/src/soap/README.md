# SOAP lane — WoW (AzerothCore / ToCloud9)

`POST /api/v1/wow/soap/{server}/exec`

AzerothCore does not speak Source RCON. Its remote-console equivalent is a
SOAP endpoint on the worldserver: an HTTP POST with Basic auth and an
`executeCommand` envelope, answered with the GM command's console output. This
module is the RCON lane's twin for that protocol — same staff gate, same
allowlist model, same audit event (`target = "soap_audit"`).

## Env scheme

`SOAP_WOW_{SERVER}_{HOST|PORT|USER|PASSWORD}`, server upper-cased. The only
well-known server today is `MAIN`.

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `SOAP_WOW_MAIN_HOST` | yes | — | Absent ⇒ the endpoint is unconfigured and every exec 404s. |
| `SOAP_WOW_MAIN_PORT` | no | `7878` | AzerothCore `SOAP.Port`. |
| `SOAP_WOW_MAIN_USER` | yes | `""` | GM **account** name, not a character. |
| `SOAP_WOW_MAIN_PASSWORD` | yes | `""` | That account's password. |

Zero configured endpoints is a clean state, not a boot failure — the registry
still initializes and logs `0 endpoints configured`.

## Cluster prerequisites

1. **`AC_SOAP_ENABLED=1`** on the worldserver fleet. AzerothCore ships
   `SOAP.Enabled = 0`; without flipping it the port never binds and every exec
   returns 502. `SOAP.IP` must also bind somewhere axum-kbve can reach —
   `127.0.0.1` (the AzerothCore default) is not reachable across pods.
2. **A dedicated GM account** in the auth DB with a seclevel high enough for
   the allowlisted commands (`account set gmlevel`, `ban account` and the
   `server shutdown` family need level 3). Create it as a service account used
   by nothing else, so the `soap_audit` trail attributes every command to the
   axum caller's `user_id` rather than to a shared human login.
3. The SOAP port must **not** be exposed outside the cluster. Basic auth over
   plain HTTP is the only thing in front of full GM authority.

## Fleet addressing — a known, unfixed limitation

The worldserver is an **Agones Fleet at `replicas: 2` (autoscaled)** and the
SOAP Service is a ClusterIP with no session affinity, so consecutive calls can
land on different worldservers. ToCloud9 assigns maps per-worldserver via
servers-registry, so a command touching an online player only takes effect if
the call happened to reach the node holding that player's map.

The ClusterIP therefore works *mechanically* — a connection always succeeds —
but it does not give a **correct target** for node-scoped commands. `kick`
reports "player not found" when it hit the wrong pod; `announce` reaches one
pod's sessions while reporting success. Both fail by returning a wrong answer
rather than an error, so nothing surfaces on its own.

Every allowlist entry declares a `scope`, and it is echoed in the exec response
so the UI can warn on it:

| scope | meaning | commands |
| --- | --- | --- |
| `realm` | shared-database write; any pod gives the identical result | `account_set_gmlevel`, `ban_account`, `unban_account` |
| `node` | result depends on which pod answered | `server_info`, `server_motd`, `gm_list`, `announce`, `notify`, `kick`, `reload_config` |

Fixing this properly needs **per-pod addressing**: enumerate the Fleet's
GameServers (or ask servers-registry which node holds the target's map), then
dial that pod's IP on 7878 directly instead of the Service. axum-kbve today has
**neither Agones API access nor a pod-IP dial path**, so `scope` is a warning
label, not a workaround.

`server shutdown` / `server restart` are deliberately absent from the allowlist
for the same reason: Agones owns the GameServer lifecycle and recreates the pod
underneath, so a SOAP shutdown's only observable effect is that a random one of
the worldservers bounced. Scaling or rolling the Fleet is a `kubectl`/Agones
operation.

## Why the allowlist is compile-time

`packages/data/soap/commands.yaml` is pulled in with `include_str!`. The
allowlist is a security boundary, so the binary is the policy artifact: there
is no DB row, no admin UI and no runtime reload that could widen the GM command
surface without a code review and a rebuild. Argument validators live in
`handler.rs` for the same reason — an argument lands inside a GM command line,
so adding a validator is a code change, not a config change.
