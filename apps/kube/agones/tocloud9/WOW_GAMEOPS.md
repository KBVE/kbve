# WoW GameOps — what landed, what is live, what a human still has to do

Handoff for `kbve.com/dashboard/gameops/wow/` and the cluster prerequisites its
backend depends on.

## The three lanes, and their real state

The WoW dashboard is not one integration, it is three with very different
readiness. Do not describe the page as "live" — one lane of three is.

| Lane | Source | State |
| --- | --- | --- |
| Fleet metrics | Prometheus, already scraping | **Live now.** No human step. |
| Account provisioning | `acore_auth` over MySQL from the edge function | Wired; waits on the ExternalSecret syncing. |
| GM commands | AzerothCore SOAP on the worldserver | Wired; waits on a GM account that does not exist. |

### Metrics — live immediately

`podmonitor.yaml` has been scraping `tocloud9-worldserver` on `:8901/metrics`
and `tocloud9-gateway` on `:8900/metrics` since before this work. Nothing in
this change touches it, and nothing has to be provisioned for it. Anything the
dashboard renders off `active_connections` or the `delay_*` tick gauges works
the moment the page ships.

That is the only lane with no human step in front of it.

## What landed

### Frontend

- `apps/kbve/astro-kbve/src/content/docs/dashboard/gameops/wow/index.mdx`
- `apps/kbve/astro-kbve/src/components/dashboard/AstroWowDashboard.astro`
- `apps/kbve/astro-kbve/src/components/rnweb/ReactWowDashRN.tsx`
- `apps/kbve/astro-kbve/src/components/dashboard/ReactGameOpsPanel.tsx` — new `wow` tile
- `apps/kbve/astro-kbve/astro.config.mjs` — sidebar entry

The page hides itself from non-staff. That is a UI affordance and nothing more:
it keeps the console out of the way of people who cannot use it. Every call the
page makes is authorised server-side in the API handlers, and that is where the
access decision actually lives.

### Cluster

- `manifests/worldserver-fleet.yaml` — SOAP enabled, bound, and a named `soap` port
- `manifests/worldserver-soap-service.yaml` — ClusterIP in front of the fleet (read its header before using it)
- `manifests/mysql-cross-namespace-rbac.yaml` — lets the functions pod read `tocloud9-mysql`
- `../../functions/manifests/tc9-mysql-externalsecret.yaml` — syncs that secret into `kilobase`
- `../../functions/manifests/functions-deployment.yaml` — `TC9_MYSQL_USER` / `TC9_MYSQL_PASSWORD`
- `../../kbve/manifest/kbve-deployment.yaml` — `SOAP_WOW_MAIN_*`
- `../../kbve/seal-wow-soap.sh` — seals the GM credential once it exists
- `../../../agones/tocloud9/docker-compose.yml` — same SOAP settings for local dev

## The Agones fleet addressing problem

This was the highest-risk item and the answer is a qualified yes.

**A stable Service can front worldserver SOAP.** Agones does not own the pod
network. A GameServer pod carries `app=tocloud9-worldserver` like any other pod,
kube-proxy programs endpoints from it normally, and fleet scaling or a
RollingUpdate is just endpoint churn. `worldserver-soap-service.yaml` works.

**It does not give a correct target,** and that is the part that decides what
you can build on it:

1. **It load-balances.** `replicas` is 2 and `worldserver-autoscaler.yaml` moves
   it. Two SOAP calls in a row can hit different worldservers with no affinity
   between them.
2. **Commands are node-scoped.** ToCloud9 hands maps out through
   servers-registry, so a worldserver only knows the players on its own maps.
   `.kick`, `.tele`, `.revive`, `.character *` against an online target return
   "player not found" whenever the call lands on the wrong node — a wrong
   answer, not an error. `.announce` reaches one node's sessions, not the realm.
3. **Endpoints go hot long before SOAP listens.** Neither worldserver container
   declares a readinessProbe, so the pod joins the Service as soon as the
   process starts, while AzerothCore is still loading maps — measured at over
   ten minutes cold with `PreloadAllNonInstancedMapGrids`. Callers must read
   `ECONNREFUSED` as "still booting".

So: **realm-global, database-backed commands only** through this Service — the
`.account` family, `.server info`. Note those are exactly the commands the MySQL
lane already does better and deterministically, so the honest scope of the SOAP
lane is narrow.

Per-player commands need per-pod addressing: enumerate GameServers in the
`tocloud9` namespace (or ask servers-registry which node owns the target's map)
and dial that pod IP on 7878. axum-kbve today has neither Agones API read access
nor any pod-IP dial path, so that is unbuilt. Do not promise targeted GM
commands on the dashboard until it exists.

One more trap worth recording: `AC_SOAP_ENABLED=1` on its own does nothing
useful. AzerothCore defaults `SOAP.IP` to `127.0.0.1`, so the listener binds
container loopback and every cross-pod dial is refused with no log line saying
why. `AC_SOAP_IP=0.0.0.0` is set alongside it for that reason.

## Why the MySQL blocker was not solved with a SealedSecret

The brief called for a new SealedSecret in the functions namespace. The repo
already answers this exact problem differently, and the existing answer is
better, so this follows the existing answer.

`secretKeyRef` genuinely cannot cross namespaces — that part of the diagnosis
holds. But the same shape has come up three times already
(`agones/mc/manifests/gameserver-secrets.yaml`,
`functions/manifests/mc-rcon-externalsecret.yaml`,
`kbve/manifest/mc-rcon-externalsecret.yaml`) and each time it was solved with
external-secrets: a `SecretStore` pointed at the source namespace plus a
`Role`/`RoleBinding` pinned to one secret name. Sealing a second ciphertext of
the same password would have created two copies that drift the instant
`seal-credentials.sh` is re-run to rotate — and the drift surfaces as an edge
function auth failure long after the rotation that caused it.

The practical consequence: **B3 needs no sealing and no human-held secret.** It
syncs from `tocloud9-mysql`, which already exists.

## Human-only steps, in order

1. **Sync ArgoCD for `agones-tocloud9`.** This applies the RBAC and the SOAP
   Service. The RBAC is at sync-wave `-1` so it lands before anything reads it.
   Verify:
   ```
   kubectl -n tocloud9 get role tocloud9-mysql-reader-for-functions
   kubectl -n tocloud9 get svc tocloud9-worldserver-soap
   ```

2. **Sync the functions app and confirm the ExternalSecret resolved.** A failed
   sync is silent from the pod's side, because the edge function treats an empty
   credential as "not configured" and disables the lane:
   ```
   kubectl -n kilobase get externalsecret tc9-mysql-credentials
   kubectl -n kilobase get secret tc9-mysql-credentials -o jsonpath='{.data.username}' | base64 -d
   ```
   `SecretSyncedError` here almost always means the tocloud9 RBAC from step 1
   has not landed yet.

3. **Restart the functions deployment** so it picks up the new env:
   ```
   kubectl -n kilobase rollout restart deployment/functions
   ```
   After this the account provisioning lane is live.

4. **Roll the worldserver fleet** to pick up the SOAP env. This is not free —
   a cold worldserver takes well over ten minutes to bind its sockets, and the
   fleet rolls one pod at a time:
   ```
   kubectl -n tocloud9 get fleet tocloud9-worldserver
   kubectl -n tocloud9 get gameservers
   ```
   Confirm the port is actually open before blaming anything downstream:
   ```
   kubectl -n tocloud9 exec <gameserver-pod> -c worldserver -- \
       sh -c 'cat /proc/net/tcp | grep 1EC6'
   ```

5. **Create the SOAP GM account.** It does not exist. SOAP has no service
   accounts — the credential is an ordinary `acore_auth` account with GM level
   3, and every command runs as that account. Create it against MySQL or from a
   worldserver console:
   ```
   .account create KBVE_SOAP <password>
   .account set gmlevel KBVE_SOAP 3 -1
   ```
   Level 3 is what the security-sensitive commands need; `-1` scopes it to all
   realms. A lower level authenticates fine and then refuses individual
   commands, which reads as a broken integration rather than a permissions
   problem. Use a dedicated account, not a GM's personal login.

6. **Seal that credential:**
   ```
   ./apps/kube/kbve/seal-wow-soap.sh
   ```
   It prompts for the username and password (never arguments, so nothing lands
   in shell history) and writes
   `apps/kube/kbve/manifest/wow-soap-sealedsecret.yaml`. Equivalent by hand:
   ```
   kubectl create secret generic wow-soap-credentials -n kbve \
       --from-literal=username='KBVE_SOAP' \
       --from-literal=password='<password>' \
       --dry-run=client -o yaml \
   | kubeseal --controller-name=sealed-secrets-controller \
       --controller-namespace=kube-system --format=yaml \
   > apps/kube/kbve/manifest/wow-soap-sealedsecret.yaml
   ```
   Secret name `wow-soap-credentials`, namespace `kbve`, keys `username` and
   `password` — the deployment references exactly those.

7. **Add it to `apps/kube/kbve/manifest/kustomization.yaml`,** commit, sync, and
   restart axum-kbve. It is deliberately not listed yet: a resource entry for a
   file that does not exist breaks the whole kustomization, and every other app
   in that namespace with it.

## Still blocked after all of the above

- **Targeted GM commands.** Per-pod addressing does not exist (see above). Only
  realm-global SOAP commands will behave correctly.
- **SOAP during worldserver startup.** The Service will have endpoints that
  refuse connections for the first ten-plus minutes of any pod's life. Until a
  readinessProbe gates the worldserver container, this is a caller-side retry
  problem, not something the manifest can fix.
