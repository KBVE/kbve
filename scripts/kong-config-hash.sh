#!/usr/bin/env bash
# Keep the kong-kong pod template's `config-hash` annotation in step with the
# contents of the kong-config ConfigMap.
#
# Kong runs DB-less: KONG_DECLARATIVE_CONFIG points at a file that an envsubst
# init container renders from the ConfigMap into an emptyDir at pod start. The
# rendered copy is never refreshed, so editing the ConfigMap changes nothing in
# the running proxy until the pods restart. Nothing in ArgoCD restarts a pod for
# a ConfigMap change on its own, which is how `preserve_host: true` (PR #14465)
# sat correct in git and absent from the live proxy for weeks.
#
# Folding a hash of the ConfigMap data into the pod template makes the restart
# fall out of the sync: the config edit and its hash land in the same commit, so
# applying that commit changes the Deployment and the pods roll. Deterministic
# from main, and independent of Reloader being healthy.
#
#   kong-config-hash.sh --check   verify the annotation matches (exit 1 if not)
#   kong-config-hash.sh --write   rewrite the annotation in place
#
# Hashes only the ConfigMap's `data` block, so relabelling the ConfigMap does
# not needlessly restart the proxy.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
config_file="${repo_root}/apps/kube/kong/manifests/kong-config.yaml"
deployment_file="${repo_root}/apps/kube/kong/manifests/kong-deployment.yaml"

mode="${1:---check}"
case "$mode" in
--check | --write) ;;
*)
    echo "Usage: $(basename "$0") [--check|--write]" >&2
    exit 2
    ;;
esac

for f in "$config_file" "$deployment_file"; do
    if [ ! -f "$f" ]; then
        echo "ERROR: not found: $f" >&2
        exit 2
    fi
done

if ! python3 -c "import yaml" 2>/dev/null; then
    echo "ERROR: python3 with PyYAML is required (pip install pyyaml)." >&2
    exit 2
fi

expected=$(python3 - "$config_file" <<'PY'
import hashlib, json, sys, yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if d]

cms = [d for d in docs if d.get("kind") == "ConfigMap" and d["metadata"]["name"] == "kong-config"]
if len(cms) != 1:
    sys.exit(f"expected exactly one kong-config ConfigMap, found {len(cms)}")

# Canonical JSON so trivial YAML reflow (line wrapping, quoting style) does not
# move the hash — only a real content change does.
payload = json.dumps(cms[0].get("data", {}), sort_keys=True, separators=(",", ":"))
print(hashlib.sha256(payload.encode()).hexdigest()[:32])
PY
)

actual=$(python3 - "$deployment_file" <<'PY'
import sys, yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if d]

deps = [d for d in docs if d.get("kind") == "Deployment" and d["metadata"]["name"] == "kong-kong"]
if len(deps) != 1:
    sys.exit(f"expected exactly one kong-kong Deployment, found {len(deps)}")

anns = deps[0]["spec"]["template"]["metadata"].get("annotations", {})
print(anns.get("config-hash", ""))
PY
)

if [ "$mode" = "--check" ]; then
    if [ "$expected" = "$actual" ]; then
        echo "config-hash up to date: $expected"
        exit 0
    fi
    cat >&2 <<EOF
ERROR: kong-kong config-hash is stale.

  expected (from kong-config.yaml): $expected
  found (in kong-deployment.yaml):  ${actual:-<missing>}

The Kong proxy renders its declarative config once at pod start, so a
kong-config.yaml change does not reach the running proxy until the pods roll.
Bump the annotation in the same commit:

  ./scripts/kong-config-hash.sh --write
EOF
    exit 1
fi

if [ "$expected" = "$actual" ]; then
    echo "config-hash already $expected — nothing to do."
    exit 0
fi

python3 - "$deployment_file" "$expected" <<'PY'
import re, sys

path, new_hash = sys.argv[1], sys.argv[2]
with open(path) as fh:
    text = fh.read()

pattern = re.compile(r"^(?P<indent>[ \t]*)config-hash:[ \t]*\S+[ \t]*$", re.MULTILINE)
text, n = pattern.subn(lambda m: f"{m.group('indent')}config-hash: {new_hash}", text)
if n != 1:
    sys.exit(f"expected exactly one config-hash line to rewrite, matched {n}")

with open(path, "w") as fh:
    fh.write(text)
PY

echo "config-hash -> $expected"
