# Plan 1 — CI Immutable Server Builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chuck UE server publish to the `ows-server-build` PVC immutable and prune-safe: the "already deployed" gate actually skips, a republish never `rm -rf`s a directory a pod may be running from, and prune never deletes a version that is pinned in git or running in the cluster.

**Architecture:** Move the three inline shell blocks in `ci-unreal-build.yml` (`server_gate` check, `Deploy server to PVC`, `Prune old versions`) into four small scripts under `.github/scripts/ows/`, each driven by env vars so a plain-bash test can run them against a temp directory. The workflow calls the scripts. Prune becomes its own job that runs after the build (or after a gate skip), reads the protected-version set (git pins on `main` + live Agones labels via the kube API with a dedicated ServiceAccount), and fails closed. No fleet manifest changes in this plan.

**Tech Stack:** bash (runner image `ghcr.io/kbve/arc-runner:0.1.7` — has `jq`, `curl`, `find`, `sort -V`), GitHub Actions reusable workflows, kustomize (`kubectl kustomize`), Argo CD (`arc-runners` app), Kubernetes RBAC.

**Spec:** `apps/rows/docs/2026-08-29-rows-phase4-version-rollout-design.md` — §2 "Plan 1", §5 "Plan 1 (workflow)", §6 step 1.

## Global Constraints

- PVC layout is **flat**: `/mnt/longhorn/ows-server/<target>/<version>/chuckServer.sh` (spec Plan 1.1). Never add a `LinuxServer/` level.
- Keep newest 3 versions unless protected (spec Plan 1.4).
- Prune **fails closed**: if the live cluster read fails, delete nothing (spec Plan 1.4).
- `force_republish` is an explicit `workflow_dispatch` input, default false, logged when used (spec Plan 1.3). It is not rollback.
- Prune reads git pins from a checkout of **`main`** (Argo deploys `main`), plus live Fleet and GameServer labels in namespace `arc-runners` (spec Plan 1.4).
- Workflows must pass `actionlint -shellcheck 'shellcheck -S error'` (`.github/workflows/ci-actionlint.yml`).
- Conventional commits, no co-author lines, PR to `dev` (AGENTS.md).
- Do not touch `apps/kube/agones/**` or `version.toml` in this plan.

## File Structure

| File | Responsibility |
|---|---|
| `.github/scripts/ows/gate.sh` | Decide `should_build` for `(PVC_ROOT, TARGET, VERSION)`; prints `should_build=true|false`. |
| `.github/scripts/ows/deploy.sh` | Copy a built `LinuxServer` dir into `${PVC_ROOT}/${TARGET}/${VERSION}` flat; refuse if a server binary is already there unless `FORCE_REPUBLISH=true`; repoint `latest`. |
| `.github/scripts/ows/protected-versions.sh` | Print the set of versions that must never be pruned: every `OWS_SERVER_VERSION` value in `apps/kube/agones/rows-tenants/*/manifests/fleet.yaml` under `REPO_ROOT`, plus every `ows.kbve.com/server-version` label on Fleets and on `Ready|Allocated|Reserved` GameServers in `arc-runners`. Exit 2 if the live read fails. |
| `.github/scripts/ows/prune.sh` | Delete version dirs beyond the newest `KEEP`, skipping the `latest` target and anything listed in `PROTECTED_FILE`. |
| `.github/scripts/ows/tests/*.sh` | One plain-bash test file per script. `run-all.sh` runs them. |
| `apps/kube/github/runners/manifests/ows-prune-rbac.yaml` | SA `arc-fleet-reader` + Role (`agones.dev` `fleets,gameservers` `get,list`) + RoleBinding in `arc-runners`. |
| `apps/kube/github/runners/manifests/kustomization.yaml` | Add the RBAC file. |
| `apps/kube/github/runners/manifests/values-ue.yaml` | `serviceAccountName: arc-fleet-reader`; bump restart trigger. |
| `.github/workflows/ci-unreal-build.yml` | `server_gate` → `gate.sh`; deploy step → `deploy.sh`; delete inline prune; new `server_prune` job; new `force_republish` input. |
| `.github/workflows/ci-unreal.yml` | `force_republish` dispatch input, pass-through to the server job. |

Script contract (all four): `set -euo pipefail`; configuration only via env vars; no positional args; every failure path prints a `::error::` or `::warning::` line and exits non-zero (except `gate.sh`, which never fails on "not found").

Test harness: each test file defines `t_<name>()` functions, a tiny `assert_eq`, creates its own `mktemp -d`, and exits non-zero on the first failure. Run with `bash .github/scripts/ows/tests/run-all.sh`.

---

### Task 1: `gate.sh` — "already deployed" check that matches the flat layout

**Files:**
- Create: `.github/scripts/ows/gate.sh`
- Create: `.github/scripts/ows/tests/lib.sh`
- Create: `.github/scripts/ows/tests/gate.test.sh`
- Create: `.github/scripts/ows/tests/run-all.sh`

**Interfaces:**
- Consumes env: `PVC_ROOT` (default `/mnt/longhorn/ows-server`), `TARGET`, `VERSION`.
- Produces stdout: exactly one line `should_build=true` or `should_build=false`. Exit 0 always unless `TARGET`/`VERSION` empty (exit 1).

- [ ] **Step 1: Write the test helper**

`.github/scripts/ows/tests/lib.sh`:

```bash
#!/usr/bin/env bash
# Minimal assertions for the ows script tests. Source this file.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "${HERE}/.." && pwd)"
export SCRIPTS

_fail_count=0

assert_eq() {
    local expected="$1" actual="$2" msg="${3:-}"
    if [ "${expected}" != "${actual}" ]; then
        echo "FAIL ${msg}: expected [${expected}] got [${actual}]" >&2
        _fail_count=$((_fail_count + 1))
    fi
}

assert_exists() {
    [ -e "$1" ] || { echo "FAIL ${2:-}: expected path to exist: $1" >&2; _fail_count=$((_fail_count + 1)); }
}

assert_missing() {
    [ ! -e "$1" ] || { echo "FAIL ${2:-}: expected path to be absent: $1" >&2; _fail_count=$((_fail_count + 1)); }
}

# Run every function named t_* in the calling file, report, exit.
run_tests() {
    local fn
    for fn in $(declare -F | awk '{print $3}' | grep '^t_' | sort); do
        echo "--- ${fn}"
        "${fn}"
    done
    if [ "${_fail_count}" -ne 0 ]; then
        echo "${_fail_count} assertion(s) failed" >&2
        exit 1
    fi
    echo "all passed"
}
```

`.github/scripts/ows/tests/run-all.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
status=0
for t in "${HERE}"/*.test.sh; do
    echo "=== ${t##*/}"
    bash "${t}" || status=1
done
exit "${status}"
```

- [ ] **Step 2: Write the failing test**

`.github/scripts/ows/tests/gate.test.sh`:

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

gate() { PVC_ROOT="$1" TARGET="$2" VERSION="$3" bash "${SCRIPTS}/gate.sh"; }

t_missing_dir_builds() {
    local pvc; pvc=$(mktemp -d)
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "missing dir"
}

t_empty_dir_builds() {
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0"
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "empty dir"
}

t_flat_binary_skips() {
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0"
    touch "${pvc}/chuckServer/1.0.0/chuckServer.sh"
    assert_eq "should_build=false" "$(gate "${pvc}" chuckServer 1.0.0)" "flat binary present"
}

t_legacy_linuxserver_level_does_not_count() {
    # The old gate looked for <ver>/LinuxServer; deploy never creates it. Must not skip on it.
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/1.0.0/LinuxServer"
    touch "${pvc}/chuckServer/1.0.0/LinuxServer/chuckServer.sh"
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "nested layout is not a deploy"
}

t_other_version_present_still_builds() {
    local pvc; pvc=$(mktemp -d)
    mkdir -p "${pvc}/chuckServer/0.9.0"
    touch "${pvc}/chuckServer/0.9.0/chuckServer.sh"
    assert_eq "should_build=true" "$(gate "${pvc}" chuckServer 1.0.0)" "different version"
}

t_empty_args_fail() {
    local pvc; pvc=$(mktemp -d)
    if PVC_ROOT="${pvc}" TARGET="" VERSION="1.0.0" bash "${SCRIPTS}/gate.sh" >/dev/null 2>&1; then
        assert_eq "exit!=0" "exit0" "empty TARGET must fail"
    fi
}

run_tests
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bash .github/scripts/ows/tests/gate.test.sh`
Expected: errors like `gate.sh: No such file or directory`, exit 1.

- [ ] **Step 4: Write `gate.sh`**

```bash
#!/usr/bin/env bash
# Decide whether the server build for TARGET/VERSION must run.
# A version counts as deployed when its flat dir holds a *Server.sh
# (PVC layout: <PVC_ROOT>/<TARGET>/<VERSION>/chuckServer.sh — no LinuxServer/ level).
# Prints exactly one line: should_build=true|false
set -euo pipefail

PVC_ROOT="${PVC_ROOT:-/mnt/longhorn/ows-server}"
TARGET="${TARGET:?TARGET is required}"
VERSION="${VERSION:?VERSION is required}"

DEST="${PVC_ROOT}/${TARGET}/${VERSION}"

if [ -d "${DEST}" ] && find "${DEST}" -maxdepth 1 -name '*Server.sh' -type f -print -quit 2>/dev/null | grep -q .; then
    echo "::notice::v${VERSION} already deployed at ${DEST}. Skipping build." >&2
    echo "should_build=false"
else
    echo "::notice::v${VERSION} not deployed at ${DEST}. Will build." >&2
    echo "should_build=true"
fi
```

`chmod +x .github/scripts/ows/gate.sh .github/scripts/ows/tests/*.sh`

- [ ] **Step 5: Run test to verify it passes**

Run: `bash .github/scripts/ows/tests/gate.test.sh`
Expected: `all passed`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/ows/gate.sh .github/scripts/ows/tests/
git commit -m "feat(ci): ows gate.sh — skip server build when flat versioned binary exists"
```

---

### Task 2: `deploy.sh` — immutable publish

**Files:**
- Create: `.github/scripts/ows/deploy.sh`
- Create: `.github/scripts/ows/tests/deploy.test.sh`

**Interfaces:**
- Consumes env: `PVC_ROOT`, `TARGET`, `VERSION`, `SERVER_DIR` (the built `LinuxServer` dir), `FORCE_REPUBLISH` (`true`/anything else, default `false`).
- Produces: `${PVC_ROOT}/${TARGET}/${VERSION}/` containing the **contents** of `SERVER_DIR`, mode 755 recursively; symlink `${PVC_ROOT}/${TARGET}/latest -> ${VERSION}` (relative). Exit 3 when the destination already holds a `*Server.sh` and `FORCE_REPUBLISH != true`.

- [ ] **Step 1: Write the failing test**

`.github/scripts/ows/tests/deploy.test.sh`:

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mk_build() { # $1 = dir to create as LinuxServer
    mkdir -p "$1/Engine"
    printf '#!/bin/sh\necho server\n' > "$1/chuckServer.sh"
    echo "sha=abc" > "$1/BUILD_INFO"
}

deploy() { # pvc target version server_dir [force]
    PVC_ROOT="$1" TARGET="$2" VERSION="$3" SERVER_DIR="$4" FORCE_REPUBLISH="${5:-false}" \
        bash "${SCRIPTS}/deploy.sh"
}

t_fresh_deploy_is_flat_and_repoints_latest() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "flat binary"
    assert_missing "${tmp}/pvc/chuckServer/1.0.0/LinuxServer" "no nested level"
    assert_eq "1.0.0" "$(readlink "${tmp}/pvc/chuckServer/latest")" "latest symlink"
    assert_eq "755" "$(stat -c %a "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh")" "mode"
}

t_republish_refused_by_default() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    echo "original" > "${tmp}/pvc/chuckServer/1.0.0/marker"
    local rc=0
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer" >/dev/null 2>&1 || rc=$?
    assert_eq "3" "${rc}" "refused exit code"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/marker" "existing dir untouched"
}

t_republish_allowed_with_force() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    echo "original" > "${tmp}/pvc/chuckServer/1.0.0/marker"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer" true
    assert_missing "${tmp}/pvc/chuckServer/1.0.0/marker" "force replaced dir"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "binary present after force"
}

t_empty_existing_dir_is_not_a_deploy() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    mkdir -p "${tmp}/pvc/chuckServer/1.0.0"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "filled empty dir"
}

t_second_version_keeps_first_and_moves_latest() {
    local tmp; tmp=$(mktemp -d)
    mk_build "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/out/LinuxServer"
    deploy "${tmp}/pvc" chuckServer 1.0.1 "${tmp}/out/LinuxServer"
    assert_exists "${tmp}/pvc/chuckServer/1.0.0/chuckServer.sh" "old kept"
    assert_eq "1.0.1" "$(readlink "${tmp}/pvc/chuckServer/latest")" "latest moved"
}

t_missing_server_dir_fails() {
    local tmp; tmp=$(mktemp -d)
    local rc=0
    deploy "${tmp}/pvc" chuckServer 1.0.0 "${tmp}/nope" >/dev/null 2>&1 || rc=$?
    assert_eq "1" "${rc}" "missing SERVER_DIR"
}

run_tests
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash .github/scripts/ows/tests/deploy.test.sh`
Expected: `deploy.sh: No such file or directory`, exit 1.

- [ ] **Step 3: Write `deploy.sh`**

```bash
#!/usr/bin/env bash
# Publish a built UE LinuxServer dir to the shared PVC as an immutable, flat version dir.
#   <PVC_ROOT>/<TARGET>/<VERSION>/chuckServer.sh   (contents of SERVER_DIR; no LinuxServer/ level)
#   <PVC_ROOT>/<TARGET>/latest -> <VERSION>
# Refuses to overwrite a version that already holds a *Server.sh unless FORCE_REPUBLISH=true.
# Exit codes: 1 bad input, 3 refused (already deployed).
set -euo pipefail

PVC_ROOT="${PVC_ROOT:-/mnt/longhorn/ows-server}"
TARGET="${TARGET:?TARGET is required}"
VERSION="${VERSION:?VERSION is required}"
SERVER_DIR="${SERVER_DIR:?SERVER_DIR is required}"
FORCE_REPUBLISH="${FORCE_REPUBLISH:-false}"

if [ ! -d "${SERVER_DIR}" ]; then
    echo "::error::SERVER_DIR does not exist: ${SERVER_DIR}"
    exit 1
fi

DEST="${PVC_ROOT}/${TARGET}/${VERSION}"

if [ -d "${DEST}" ] && find "${DEST}" -maxdepth 1 -name '*Server.sh' -type f -print -quit 2>/dev/null | grep -q .; then
    if [ "${FORCE_REPUBLISH}" = "true" ]; then
        echo "::warning::FORCE_REPUBLISH=true — replacing already-deployed ${TARGET} v${VERSION} at ${DEST}. A pod may be running from it."
        rm -rf "${DEST}"
    else
        echo "::error::${TARGET} v${VERSION} is already deployed at ${DEST}. Versions are immutable: bump the version, or re-run with force_republish=true."
        exit 3
    fi
fi

mkdir -p "${DEST}"
cp -r "${SERVER_DIR}/." "${DEST}/"
chmod -R 755 "${DEST}"

ln -sfn "${VERSION}" "${PVC_ROOT}/${TARGET}/latest"

echo "::notice::${TARGET} v${VERSION} deployed to ${DEST} ($(du -sh "${DEST}" | cut -f1))"
ls -la "${DEST}/" | head -10
[ -f "${DEST}/BUILD_INFO" ] && cat "${DEST}/BUILD_INFO" || true
```

`chmod +x .github/scripts/ows/deploy.sh`

- [ ] **Step 4: Run test to verify it passes**

Run: `bash .github/scripts/ows/tests/deploy.test.sh`
Expected: `all passed`.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/ows/deploy.sh .github/scripts/ows/tests/deploy.test.sh
git commit -m "feat(ci): ows deploy.sh — immutable flat publish, force_republish escape hatch"
```

---

### Task 3: `protected-versions.sh` — pins from git + live Agones labels

**Files:**
- Create: `.github/scripts/ows/protected-versions.sh`
- Create: `.github/scripts/ows/tests/protected-versions.test.sh`
- Create: `.github/scripts/ows/tests/fixtures/fleet-pinned.yaml`
- Create: `.github/scripts/ows/tests/fixtures/fleets.json`
- Create: `.github/scripts/ows/tests/fixtures/gameservers.json`

**Interfaces:**
- Consumes env: `REPO_ROOT` (checkout of `main`), `KUBE_API` (default `https://kubernetes.default.svc`), `KUBE_NS` (default `arc-runners`), `SA_DIR` (default `/var/run/secrets/kubernetes.io/serviceaccount`). Test injection: `FLEETS_JSON_FILE` / `GAMESERVERS_JSON_FILE` — when set, read those files instead of calling the API.
- Produces stdout: one version per line, sorted, unique. Exit 2 when the live read fails (caller must then skip pruning). Exit 0 with possibly empty output when nothing is pinned and the cluster has no labelled objects (Plan 2 not yet landed).

- [ ] **Step 1: Write fixtures**

`.github/scripts/ows/tests/fixtures/fleet-pinned.yaml` (shape of Plan 2's fleet.yaml; only the lines the script greps matter):

```yaml
apiVersion: agones.dev/v1
kind: Fleet
metadata:
    name: rows-chuckrpg-beta
spec:
    template:
        metadata:
            labels:
                ows.kbve.com/server-version: '0.3.51'
        spec:
            template:
                spec:
                    containers:
                        - name: ue5-server
                          env:
                              - name: OWS_SERVER_VERSION
                                value: '0.3.51'
                        - name: build-reporter
                          env:
                              - name: OWS_SERVER_VERSION
                                value: '0.3.51'
```

`.github/scripts/ows/tests/fixtures/fleets.json`:

```json
{"items":[
 {"metadata":{"name":"rows-chuckrpg-beta"},"spec":{"template":{"metadata":{"labels":{"ows.kbve.com/server-version":"0.3.52"}}}}},
 {"metadata":{"name":"rows-chuckrpg-dev"},"spec":{"template":{"metadata":{"labels":{}}}}}
]}
```

`.github/scripts/ows/tests/fixtures/gameservers.json`:

```json
{"items":[
 {"metadata":{"name":"a","labels":{"ows.kbve.com/server-version":"0.3.49"}},"status":{"state":"Allocated"}},
 {"metadata":{"name":"b","labels":{"ows.kbve.com/server-version":"0.3.52"}},"status":{"state":"Ready"}},
 {"metadata":{"name":"c","labels":{"ows.kbve.com/server-version":"0.3.40"}},"status":{"state":"Shutdown"}},
 {"metadata":{"name":"d","labels":{}},"status":{"state":"Reserved"}}
]}
```

- [ ] **Step 2: Write the failing test**

`.github/scripts/ows/tests/protected-versions.test.sh`:

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
FX="${SCRIPTS}/tests/fixtures"

mk_repo() { # $1 = repo root; copies the pinned fleet fixture into the expected path
    mkdir -p "$1/apps/kube/agones/rows-tenants/chuckrpg-beta/manifests"
    cp "${FX}/fleet-pinned.yaml" "$1/apps/kube/agones/rows-tenants/chuckrpg-beta/manifests/fleet.yaml"
}

protected() { # repo fleets_json gs_json
    REPO_ROOT="$1" FLEETS_JSON_FILE="$2" GAMESERVERS_JSON_FILE="$3" bash "${SCRIPTS}/protected-versions.sh"
}

t_union_of_git_pin_fleet_label_and_live_gs() {
    local repo; repo=$(mktemp -d); mk_repo "${repo}"
    local out; out=$(protected "${repo}" "${FX}/fleets.json" "${FX}/gameservers.json")
    # git pin 0.3.51; fleet label 0.3.52; Allocated GS 0.3.49; Ready GS 0.3.52; Shutdown GS 0.3.40 excluded
    assert_eq $'0.3.49\n0.3.51\n0.3.52' "${out}" "union"
}

t_no_pins_no_labels_is_empty_and_ok() {
    local repo; repo=$(mktemp -d)
    mkdir -p "${repo}/apps/kube/agones/rows-tenants/chuckrpg-beta/manifests"
    printf 'apiVersion: agones.dev/v1\nkind: Fleet\n' > "${repo}/apps/kube/agones/rows-tenants/chuckrpg-beta/manifests/fleet.yaml"
    local empty; empty=$(mktemp); echo '{"items":[]}' > "${empty}"
    local out rc=0
    out=$(protected "${repo}" "${empty}" "${empty}") || rc=$?
    assert_eq "0" "${rc}" "exit ok"
    assert_eq "" "${out}" "empty"
}

t_missing_live_file_is_read_failure() {
    local repo; repo=$(mktemp -d); mk_repo "${repo}"
    local rc=0
    protected "${repo}" "/nonexistent.json" "${FX}/gameservers.json" >/dev/null 2>&1 || rc=$?
    assert_eq "2" "${rc}" "live read failure exit 2"
}

t_malformed_live_json_is_read_failure() {
    local repo; repo=$(mktemp -d); mk_repo "${repo}"
    local bad; bad=$(mktemp); echo 'not json' > "${bad}"
    local rc=0
    protected "${repo}" "${bad}" "${FX}/gameservers.json" >/dev/null 2>&1 || rc=$?
    assert_eq "2" "${rc}" "malformed json exit 2"
}

t_git_pins_from_all_tenants() {
    local repo; repo=$(mktemp -d); mk_repo "${repo}"
    mkdir -p "${repo}/apps/kube/agones/rows-tenants/chuckrpg-dev/manifests"
    sed 's/0.3.51/0.3.20/g' "${FX}/fleet-pinned.yaml" > "${repo}/apps/kube/agones/rows-tenants/chuckrpg-dev/manifests/fleet.yaml"
    local empty; empty=$(mktemp); echo '{"items":[]}' > "${empty}"
    assert_eq $'0.3.20\n0.3.51' "$(protected "${repo}" "${empty}" "${empty}")" "both tenants"
}

run_tests
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bash .github/scripts/ows/tests/protected-versions.test.sh`
Expected: `protected-versions.sh: No such file or directory`.

- [ ] **Step 4: Write `protected-versions.sh`**

```bash
#!/usr/bin/env bash
# Print the set of server versions that prune must never delete, one per line, sorted+unique:
#   - every OWS_SERVER_VERSION value in apps/kube/agones/rows-tenants/*/manifests/fleet.yaml under REPO_ROOT
#   - every ows.kbve.com/server-version label on Fleets in KUBE_NS
#   - every ows.kbve.com/server-version label on GameServers in state Ready|Allocated|Reserved in KUBE_NS
# Exit 2 if the live cluster read fails — the caller must then skip pruning (fail closed).
# Test injection: FLEETS_JSON_FILE / GAMESERVERS_JSON_FILE replace the API calls.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:?REPO_ROOT is required}"
KUBE_API="${KUBE_API:-https://kubernetes.default.svc}"
KUBE_NS="${KUBE_NS:-arc-runners}"
SA_DIR="${SA_DIR:-/var/run/secrets/kubernetes.io/serviceaccount}"
LABEL='ows.kbve.com/server-version'

git_pins() {
    local f
    for f in "${REPO_ROOT}"/apps/kube/agones/rows-tenants/*/manifests/fleet.yaml; do
        [ -f "${f}" ] || continue
        # the line after "name: OWS_SERVER_VERSION" is "value: 'x.y.z'"
        awk '/name: OWS_SERVER_VERSION/{getline; if (match($0, /value:[[:space:]]*['"'"'"]?([0-9][^'"'"'" ]*)/, m)) print m[1]}' "${f}"
    done
}

fetch() { # $1 = api path ; $2 = injected file var
    local injected="${!2:-}"
    if [ -n "${injected}" ]; then
        cat "${injected}" 2>/dev/null || return 1
        return 0
    fi
    local token
    token=$(cat "${SA_DIR}/token") || return 1
    curl -sS --fail --max-time 15 --cacert "${SA_DIR}/ca.crt" \
        -H "Authorization: Bearer ${token}" "${KUBE_API}$1" || return 1
}

live_versions() {
    local fleets gs
    fleets=$(fetch "/apis/agones.dev/v1/namespaces/${KUBE_NS}/fleets" FLEETS_JSON_FILE) \
        || { echo "__FETCH_FAILED__"; return 1; }
    gs=$(fetch "/apis/agones.dev/v1/namespaces/${KUBE_NS}/gameservers" GAMESERVERS_JSON_FILE) \
        || { echo "__FETCH_FAILED__"; return 1; }
    # jq exit 2+ = parse error. `// empty` keeps missing labels from printing null.
    printf '%s' "${fleets}" | jq -r --arg l "${LABEL}" \
        '.items[] | .spec.template.metadata.labels[$l] // empty' \
        || { echo "__PARSE_FAILED__"; return 1; }
    printf '%s' "${gs}" | jq -r --arg l "${LABEL}" \
        '.items[] | select(.status.state as $s | ["Ready","Allocated","Reserved"] | index($s)) | .metadata.labels[$l] // empty' \
        || { echo "__PARSE_FAILED__"; return 1; }
}

set +e
live_out=$(live_versions)
rc=$?
set -e
if [ "${rc}" -ne 0 ] || [[ "${live_out}" == *__FETCH_FAILED__* ]] || [[ "${live_out}" == *__PARSE_FAILED__* ]]; then
    echo "::error::live Agones read failed (rc=${rc}); prune must skip" >&2
    exit 2
fi

{ git_pins; printf '%s\n' "${live_out}"; } | grep -v '^$' | sort -u -V
```

Notes for the implementer:
- `awk` `match(..., m)` with an array needs GNU awk. `ghcr.io/kbve/arc-runner:0.1.7` is Ubuntu-based (gawk present); if the local test run shows `awk: syntax error`, install `gawk` locally — do not rewrite to `sed`.
- Empty results are legitimate (`jq -r` with `// empty` prints nothing and exits 0). Only fetch failures and parse errors exit 2; the markers make a `fetch` failure unambiguous even when nothing else was printed.

`chmod +x .github/scripts/ows/protected-versions.sh`

- [ ] **Step 5: Run test to verify it passes**

Run: `bash .github/scripts/ows/tests/protected-versions.test.sh`
Expected: `all passed`.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/ows/protected-versions.sh .github/scripts/ows/tests/protected-versions.test.sh .github/scripts/ows/tests/fixtures/
git commit -m "feat(ci): ows protected-versions.sh — git pins + live Agones labels, fail closed"
```

---

### Task 4: `prune.sh` — keep newest N, skip latest + protected

**Files:**
- Create: `.github/scripts/ows/prune.sh`
- Create: `.github/scripts/ows/tests/prune.test.sh`

**Interfaces:**
- Consumes env: `PVC_ROOT`, `TARGET`, `KEEP` (default 3), `PROTECTED_FILE` (path; one version per line; may be empty file). Missing `PROTECTED_FILE` is an error (exit 1) — prune must never run without the protected set.
- Produces: deletes `${PVC_ROOT}/${TARGET}/<version>` dirs; prints `Removing <v>` / `Skipping <v> (<reason>)` lines.

- [ ] **Step 1: Write the failing test**

`.github/scripts/ows/tests/prune.test.sh`:

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mk_pvc() { # $1 = pvc root ; versions...
    local pvc="$1"; shift
    local v
    for v in "$@"; do mkdir -p "${pvc}/chuckServer/${v}"; touch "${pvc}/chuckServer/${v}/chuckServer.sh"; done
}

prune() { # pvc protected_file [keep]
    PVC_ROOT="$1" TARGET=chuckServer PROTECTED_FILE="$2" KEEP="${3:-3}" bash "${SCRIPTS}/prune.sh"
}

t_keeps_newest_three() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.47 0.3.48 0.3.49 0.3.50 0.3.51
    ln -sfn 0.3.51 "${pvc}/chuckServer/latest"
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_missing "${pvc}/chuckServer/0.3.47" "oldest removed"
    assert_missing "${pvc}/chuckServer/0.3.48" "second oldest removed"
    assert_exists "${pvc}/chuckServer/0.3.49" "kept 3rd newest"
    assert_exists "${pvc}/chuckServer/0.3.51" "kept newest"
}

t_semver_order_not_lexical() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.9 0.3.10 0.3.11 0.3.12
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_missing "${pvc}/chuckServer/0.3.9" "0.3.9 is oldest"
    assert_exists "${pvc}/chuckServer/0.3.12" "0.3.12 newest"
}

t_protected_survives_beyond_keep() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.40 0.3.49 0.3.50 0.3.51 0.3.52
    local prot; prot=$(mktemp); printf '0.3.40\n0.3.49\n' > "${prot}"
    prune "${pvc}" "${prot}"
    assert_exists "${pvc}/chuckServer/0.3.40" "protected 0.3.40 (Allocated old GS) kept"
    assert_exists "${pvc}/chuckServer/0.3.49" "protected 0.3.49 kept"
}

t_latest_target_survives() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4 0.3.5
    ln -sfn 0.3.1 "${pvc}/chuckServer/latest"   # someone re-pointed latest backwards
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_exists "${pvc}/chuckServer/0.3.1" "latest target kept"
    assert_missing "${pvc}/chuckServer/0.3.2" "unprotected old removed"
}

t_missing_protected_file_aborts() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4
    local rc=0
    prune "${pvc}" "/nonexistent" >/dev/null 2>&1 || rc=$?
    assert_eq "1" "${rc}" "exit 1"
    assert_exists "${pvc}/chuckServer/0.3.1" "nothing deleted"
}

t_non_version_dirs_ignored() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2 0.3.3 0.3.4
    mkdir -p "${pvc}/chuckServer/scratch"
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_exists "${pvc}/chuckServer/scratch" "non-version dir untouched"
}

t_nothing_to_prune() {
    local pvc; pvc=$(mktemp -d); mk_pvc "${pvc}" 0.3.1 0.3.2
    local prot; prot=$(mktemp)
    prune "${pvc}" "${prot}"
    assert_exists "${pvc}/chuckServer/0.3.1" "kept"
}

run_tests
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash .github/scripts/ows/tests/prune.test.sh`
Expected: `prune.sh: No such file or directory`.

- [ ] **Step 3: Write `prune.sh`**

```bash
#!/usr/bin/env bash
# Delete old server version dirs under <PVC_ROOT>/<TARGET>, keeping:
#   - the newest KEEP versions (semver order)
#   - the target of the `latest` symlink
#   - every version listed in PROTECTED_FILE (git pins + live cluster labels)
# PROTECTED_FILE must exist (may be empty). Never runs without it.
set -euo pipefail

PVC_ROOT="${PVC_ROOT:-/mnt/longhorn/ows-server}"
TARGET="${TARGET:?TARGET is required}"
KEEP="${KEEP:-3}"
PROTECTED_FILE="${PROTECTED_FILE:?PROTECTED_FILE is required}"

if [ ! -f "${PROTECTED_FILE}" ]; then
    echo "::error::PROTECTED_FILE not found: ${PROTECTED_FILE} — refusing to prune"
    exit 1
fi

PVC_DIR="${PVC_ROOT}/${TARGET}"
[ -d "${PVC_DIR}" ] || { echo "Nothing to prune: ${PVC_DIR} does not exist"; exit 0; }
cd "${PVC_DIR}"

LATEST_TARGET=$(readlink latest 2>/dev/null || echo "")
mapfile -t PROTECTED < <(grep -v '^$' "${PROTECTED_FILE}" || true)

is_protected() {
    local v="$1" p
    [ "${v}" = "${LATEST_TARGET}" ] && return 0
    for p in "${PROTECTED[@]:-}"; do [ "${v}" = "${p}" ] && return 0; done
    return 1
}

echo "Pruning ${PVC_DIR}: keep newest ${KEEP}; latest -> '${LATEST_TARGET:-none}'; protected: ${PROTECTED[*]:-none}"

mapfile -t CANDIDATES < <(find . -mindepth 1 -maxdepth 1 -type d -name '[0-9]*' -printf '%f\n' | sort -V -r | tail -n +$((KEEP + 1)))

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
    echo "  Nothing to prune."
    exit 0
fi

for DIR in "${CANDIDATES[@]}"; do
    if is_protected "${DIR}"; then
        echo "  Skipping ${DIR} (protected)"
    else
        echo "  Removing ${DIR}"
        rm -rf -- "./${DIR}"
    fi
done
```

`chmod +x .github/scripts/ows/prune.sh`

- [ ] **Step 4: Run test to verify it passes**

Run: `bash .github/scripts/ows/tests/prune.test.sh`
Expected: `all passed`.

- [ ] **Step 5: Run the whole suite**

Run: `bash .github/scripts/ows/tests/run-all.sh`
Expected: four `all passed`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/ows/prune.sh .github/scripts/ows/tests/prune.test.sh
git commit -m "feat(ci): ows prune.sh — keep newest 3, never delete latest or protected versions"
```

---

### Task 5: RBAC for the prune job's live read

**Files:**
- Create: `apps/kube/github/runners/manifests/ows-prune-rbac.yaml`
- Modify: `apps/kube/github/runners/manifests/kustomization.yaml` (resources list, after `vm-starter-rbac.yaml`)
- Modify: `apps/kube/github/runners/manifests/values-ue.yaml:21-25` (template metadata/spec)

**Interfaces:**
- Produces: ServiceAccount `arc-fleet-reader` in `arc-runners`, bound to a Role allowing `get,list` on `agones.dev` `fleets` and `gameservers` in `arc-runners`. `arc-runner-ue` pods run as that SA, so `/var/run/secrets/kubernetes.io/serviceaccount/token` works for `protected-versions.sh`.

- [ ] **Step 1: Write the RBAC manifest**

`apps/kube/github/runners/manifests/ows-prune-rbac.yaml`:

```yaml
# Least-privilege RBAC for the OWS server-build prune job (ci-unreal-build.yml
# server_prune). An arc-runner-ue pod (this SA) lists Agones Fleets and
# GameServers in arc-runners to learn which server versions are pinned or
# running, so prune never deletes a build a pod is executing from.
# Read-only; no writes, no other namespaces.
apiVersion: v1
kind: ServiceAccount
metadata:
    name: arc-fleet-reader
    namespace: arc-runners
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
    name: arc-fleet-reader
    namespace: arc-runners
rules:
    - apiGroups: ['agones.dev']
      resources: ['fleets', 'gameservers']
      verbs: ['get', 'list']
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
    name: arc-fleet-reader
    namespace: arc-runners
roleRef:
    apiGroup: rbac.authorization.k8s.io
    kind: Role
    name: arc-fleet-reader
subjects:
    - kind: ServiceAccount
      name: arc-fleet-reader
      namespace: arc-runners
```

- [ ] **Step 2: Register it in kustomization**

In `apps/kube/github/runners/manifests/kustomization.yaml`, after the line `    - vm-starter-rbac.yaml` add:

```yaml
    - ows-prune-rbac.yaml
```

- [ ] **Step 3: Attach the SA to the UE runner**

In `apps/kube/github/runners/manifests/values-ue.yaml` change:

```yaml
template:
    metadata:
        annotations:
            kbve.com/restart-trigger: '20260624-pvc-dind-tiered'
    spec:
        initContainers:
```

to:

```yaml
template:
    metadata:
        annotations:
            kbve.com/restart-trigger: '20260829-fleet-reader-sa'
    spec:
        # Read-only Agones access for the server_prune job (ows-prune-rbac.yaml).
        serviceAccountName: arc-fleet-reader
        initContainers:
```

- [ ] **Step 4: Verify the kustomization builds and contains the objects**

Run: `kubectl kustomize apps/kube/github/runners/manifests | grep -c 'name: arc-fleet-reader'`
Expected: `3` (SA, Role, RoleBinding).

Run: `grep -n 'serviceAccountName: arc-fleet-reader' apps/kube/github/runners/manifests/values-ue.yaml`
Expected: one match.

- [ ] **Step 5: Commit**

```bash
git add apps/kube/github/runners/manifests/ows-prune-rbac.yaml apps/kube/github/runners/manifests/kustomization.yaml apps/kube/github/runners/manifests/values-ue.yaml
git commit -m "feat(kube): arc-fleet-reader SA for OWS prune job (read-only agones fleets/gameservers)"
```

---

### Task 6: Wire the workflow — gate, deploy, prune job, `force_republish`

**Files:**
- Modify: `.github/workflows/ci-unreal-build.yml`
  - inputs block (add `force_republish`, after `manifest_version` ~`:102-106`)
  - `server_gate` job (`:340-368`)
  - `server_build` "Deploy server to PVC" step (`:619-635`) and "Prune old versions" step (`:637-670`, delete)
  - new `server_prune` job after `server_build`'s `Cleanup` step (`:672-676`)
- Modify: `.github/workflows/ci-unreal.yml`
  - `workflow_dispatch.inputs` (add `force_republish`, after `version` ~`:35-38`)
  - `server` job `with:` (`:98-108`)

**Interfaces:**
- Consumes: the four scripts from Tasks 1–4 by path; SA from Task 5.
- Produces: `server_gate.outputs.should_build` (unchanged name), `inputs.force_republish` (boolean, default false) on both workflows.

- [ ] **Step 1: Add the `force_republish` input to `ci-unreal-build.yml`**

After the `manifest_version` input (the block ending `default: ''` around line 106), add:

```yaml
            force_republish:
                description: '[server] Overwrite an already-deployed version dir on the PVC (NOT rollback; a pod may be running from it)'
                required: false
                type: boolean
                default: false
```

- [ ] **Step 2: Replace the `server_gate` check step**

Replace the whole `- name: Check if version already deployed` step (`:349-368`) with:

```yaml
            - name: Checkout scripts
              uses: actions/checkout@v7
              with:
                  sparse-checkout: .github/scripts/ows
                  sparse-checkout-cone-mode: false

            - name: Check if version already deployed
              id: check
              env:
                  TARGET: ${{ needs.server_config.outputs.server_target }}
                  VERSION: ${{ needs.server_config.outputs.version }}
              run: |
                  # PVC layout is flat: <target>/<version>/chuckServer.sh (no LinuxServer/ level).
                  bash .github/scripts/ows/gate.sh >> "$GITHUB_OUTPUT"
```

Note `server_gate` currently has no checkout step; the sparse checkout is required for the script.

- [ ] **Step 3: Replace the deploy step and delete the inline prune**

Replace `- name: Deploy server to PVC` (`:619-635`) with:

```yaml
            - name: Deploy server to PVC
              env:
                  TARGET: ${{ needs.server_config.outputs.server_target }}
                  VERSION: ${{ needs.server_config.outputs.version }}
                  FORCE_REPUBLISH: ${{ inputs.force_republish && 'true' || 'false' }}
              run: |
                  SERVER_DIR=$(find /tmp/ue5-build-output -name "LinuxServer" -type d | head -1)
                  export SERVER_DIR
                  bash .github/scripts/ows/deploy.sh
```

Delete the entire `- name: Prune old versions` step (`:637-670`). Keep `Cleanup`.

- [ ] **Step 4: Add the `server_prune` job**

Directly after the `server_build` job (after its `Cleanup` step, before the `# ════ GAME` banner), add:

```yaml
    server_prune:
        name: Prune old server builds
        needs: [server_config, server_gate, server_build]
        # Runs after a successful build OR a gate skip (nothing new, but the
        # protected set may have changed). Never after a failed build.
        if: |
            always() && inputs.mode == 'server'
            && needs.server_gate.result == 'success'
            && (needs.server_build.result == 'success' || needs.server_build.result == 'skipped')
        runs-on: arc-runner-ue
        timeout-minutes: 10
        permissions:
            contents: read
        steps:
            # Pins are read from main: Argo deploys main, so a pin merged to dev
            # but not yet promoted is covered by the live-cluster read instead.
            - name: Checkout main (fleet pins)
              uses: actions/checkout@v7
              with:
                  ref: main
                  sparse-checkout: |
                      .github/scripts/ows
                      apps/kube/agones/rows-tenants
                  sparse-checkout-cone-mode: false

            - name: Collect protected versions
              id: protected
              run: |
                  set +e
                  REPO_ROOT="$PWD" bash .github/scripts/ows/protected-versions.sh > /tmp/protected-versions.txt
                  rc=$?
                  set -e
                  if [ "$rc" -ne 0 ]; then
                    echo "::warning::protected-versions.sh failed (rc=$rc); skipping prune (fail closed)"
                    echo "skip=true" >> "$GITHUB_OUTPUT"
                  else
                    echo "Protected: $(tr '\n' ' ' < /tmp/protected-versions.txt)"
                    echo "skip=false" >> "$GITHUB_OUTPUT"
                  fi

            - name: Prune
              if: steps.protected.outputs.skip == 'false'
              env:
                  TARGET: ${{ needs.server_config.outputs.server_target }}
                  PROTECTED_FILE: /tmp/protected-versions.txt
                  KEEP: '3'
              run: bash .github/scripts/ows/prune.sh
```

- [ ] **Step 5: Thread `force_republish` through `ci-unreal.yml`**

In `workflow_dispatch.inputs`, after the `version` input block, add:

```yaml
            force_republish:
                description: '[server] Overwrite an already-deployed version dir on the PVC (not rollback)'
                required: false
                type: boolean
                default: false
```

In the `server` job `with:` block, after `version_toml: ...`, add:

```yaml
            force_republish: ${{ inputs.force_republish == true }}
```

- [ ] **Step 6: Lint the workflows the way CI does**

Run (downloads actionlint to the scratchpad; shellcheck is optional locally):

```bash
cd /tmp/claude-1000/-home-fudster-kbve-kbve/9eeb875c-ffd7-4a3a-8c57-59a538be3da4/scratchpad \
 && bash <(curl -sSf https://raw.githubusercontent.com/rhysd/actionlint/v1.7.12/scripts/download-actionlint.bash) 1.7.12 >/dev/null \
 && cd - >/dev/null \
 && /tmp/claude-1000/-home-fudster-kbve-kbve/9eeb875c-ffd7-4a3a-8c57-59a538be3da4/scratchpad/actionlint -color \
      -shellcheck= .github/workflows/ci-unreal-build.yml .github/workflows/ci-unreal.yml
```

Expected: no output, exit 0. Fix anything it reports (typical: `needs` context in `if:` of a job that is not listed in `needs`, or a boolean input compared to a string).

- [ ] **Step 7: Run the script suite once more**

Run: `bash .github/scripts/ows/tests/run-all.sh`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ci-unreal-build.yml .github/workflows/ci-unreal.yml
git commit -m "feat(ci): immutable OWS server publish — script-driven gate/deploy, fail-closed prune job, force_republish"
```

---

### Task 7: Spec bookkeeping + PR

**Files:**
- Modify: `apps/rows/docs/2026-08-29-rows-phase4-version-rollout-design.md` (§1 "Build delivery" bullets 1–4; §6 step 1)

- [ ] **Step 1: Mark Plan 1 delivered in the spec**

In §1 "Build delivery (CI → PVC)", prefix the four bullets about `rm -rf`, the gate, prune-in-job, and `.nfs*` with `**(fixed by Plan 1, PR #<n>)**` — fill the PR number after Step 3. In §6, change `1. Plan 1 (CI) — PR to \`dev\`.` to `1. Plan 1 (CI) — PR #<n> to \`dev\`. Done.`

- [ ] **Step 2: Commit**

```bash
git add apps/rows/docs/2026-08-29-rows-phase4-version-rollout-design.md
git commit -m "docs(rows): mark Plan 1 (CI immutable builds) delivered"
```

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --base dev \
  --title "feat(ci): immutable OWS server builds — real gate, no rm -rf, fail-closed prune" \
  --body "$(cat <<'EOF'
Plan 1 of apps/rows/docs/2026-08-29-rows-phase4-version-rollout-design.md.

- server_gate now checks the flat layout (`<ver>/chuckServer.sh`), so "already deployed" actually skips.
- Deploy refuses to overwrite a deployed version (exit 3) unless `force_republish=true` (new workflow_dispatch input; not rollback).
- Prune moved to its own job after build-or-skip. Protected set = OWS_SERVER_VERSION pins in fleet.yaml on main + live Agones Fleet/GameServer labels (Ready|Allocated|Reserved). Live read failure → prune skipped.
- New read-only SA `arc-fleet-reader` for arc-runner-ue (agones fleets/gameservers get,list in arc-runners).
- Scripts under .github/scripts/ows/ with plain-bash tests: `bash .github/scripts/ows/tests/run-all.sh`.

No fleet manifest or version.toml changes. Argo `arc-runners` app picks up the SA on merge to main.
EOF
)"
```

Then go back and fill `#<n>` in Step 1, amend, force-push with lease:

```bash
git commit --amend --no-edit
git push --force-with-lease
```

---

## Self-review

**Spec coverage (Plan 1.1–1.5, §5 Plan 1, §6 step 1):**
- 1.1 flat layout recorded — Task 1 comment, Task 6 Step 2 comment. ✔
- 1.2 gate fix — Task 1 + Task 6 Step 2. ✔
- 1.3 immutable publish + `force_republish` — Task 2 + Task 6 Steps 1/3/5. ✔
- 1.4 prune job, `main` checkout, live Fleet + GameServer labels, RBAC, curl with SA token, fail closed — Tasks 3, 4, 5, 6 Step 4. ✔
- 1.5 `latest` stays — Task 2 (symlink kept), Task 4 (protected). ✔
- §5 Plan 1 tests: gate skip (`t_flat_binary_skips`), deploy refuses (`t_republish_refused_by_default`), prune protects pin on main / live label / Allocated-only label (`t_protected_survives_beyond_keep` + `t_union_of_git_pin_fleet_label_and_live_gs`), prune skips on live-read failure (`t_missing_live_file_is_read_failure` + Task 6 Step 4 `skip=true`). ✔

**Placeholders:** Task 7 `#<n>` is filled by the executor after `gh pr create`; that is the only deferred value. 

**Type consistency:** output key `should_build` matches the existing `server_build.if` (`needs.server_gate.outputs.should_build == 'true'`). Env names (`PVC_ROOT`, `TARGET`, `VERSION`, `SERVER_DIR`, `FORCE_REPUBLISH`, `REPO_ROOT`, `PROTECTED_FILE`, `KEEP`) are identical across scripts, tests, and workflow steps. `force_republish` is `type: boolean` in both workflows; the deploy step converts it to the string `'true'`/`'false'` the script expects.
