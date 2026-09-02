# services/functions

Serverless function bundles. One directory per runtime, because a function is
written against its host's request model and cannot move between hosts without
being rewritten -- the split is by runtime, not by feature.

| Runtime                        | Directory | Moon project | Image               |
| ------------------------------ | --------- | ------------ | ------------------- |
| Supabase `edge-runtime` (Deno) | `deno/`   | `edge`       | `ghcr.io/kbve/edge` |

The moon id and the image stay `edge`: the release tag (`edge@<semver>`) and
`apps/kube/functions/manifests/functions-deployment.yaml` pin that name, and
renaming them would retag a service the cluster is already running.

## Adding a runtime

Add a sibling directory (`cloudflare/`, `deno-deploy/`, ...) with its own
`moon.yml`, register it under `projects` in `.moon/workspace.yml`, and give it
an entry in `packages/npm/devops/src/lib/ci/registry.ts` if it publishes an
image. Nothing is shared across runtimes today; hoist code here only once two
of them need the same thing.

## deno/

`deno/functions/<name>/index.ts` is one Supabase edge function; `main/` is the
router the runtime boots with, `_shared/` is common code. `version.toml` is the
function registry the image bakes into `_shared/manifest.ts` at build time.

```sh
moon run edge:check        # deno check, plus the bare-specifier guard
moon run edge:containerx   # build kbve/edge:latest
moon run edge:e2e          # build, boot on :9100, run the vitest suite in e2e/
```
