#!/usr/bin/env python3
"""Compile Vector's config the way Vector will, using the image Vector will run.

The 2026-08-07 outage came from a config that was valid when it was written and
invalid by the time it ran: `duration` became a reserved VRL word between the
version in the cluster then and the one pinned now. Nothing on the way to
production ever asked Vector whether it could load the file, so the DaemonSet
crashlooped for a fortnight and took every log and trace to ClickHouse with it.

Two details are what make this check real rather than decorative:

  * The image tag is read from vector-daemonset.yaml, never hardcoded. The whole
    failure was version drift, so a pinned validator would happily pass the very
    config that crashes the cluster.

  * `--skip-healthchecks`, NOT `--no-environment`. `--no-environment` skips
    building the topology, so VRL is never compiled and a broken transform
    validates clean -- it passes the real bug. `--skip-healthchecks` still
    compiles every transform and only drops the outbound connection tests.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

import yaml

REPO = pathlib.Path(__file__).resolve().parent.parent
MANIFESTS = REPO / "apps" / "kube" / "vector" / "manifests"

# Vector resolves ${VAR} at load time and fails on anything unset, so every
# reference gets a placeholder. Values only need the right shape: health checks
# are skipped, so nothing is ever dialled.
PLACEHOLDERS = {
    "CLICKHOUSE_ENDPOINT": "http://localhost:8123",
}
DEFAULT_PLACEHOLDER = "placeholder"

KUBECONFIG_STUB = """apiVersion: v1
kind: Config
clusters:
    - cluster: { server: https://127.0.0.1:6443 }
      name: stub
contexts:
    - context: { cluster: stub, user: stub }
      name: stub
current-context: stub
users:
    - name: stub
      user: { token: stub }
"""


def docs(path: pathlib.Path):
    return [d for d in yaml.safe_load_all(path.read_text()) if d]


def vector_image() -> str:
    """Read the tag from the DaemonSet so the validator tracks the deployment."""
    for doc in docs(MANIFESTS / "vector-daemonset.yaml"):
        if doc.get("kind") != "DaemonSet":
            continue
        for container in doc["spec"]["template"]["spec"]["containers"]:
            image = container.get("image", "")
            if "vector" in image:
                return image
    raise SystemExit("no vector image found in vector-daemonset.yaml")


def vector_config() -> str:
    for doc in docs(MANIFESTS / "vector-config.yaml"):
        if doc.get("kind") == "ConfigMap" and "vector.yml" in (doc.get("data") or {}):
            return doc["data"]["vector.yml"]
    raise SystemExit("no vector.yml key found in vector-config.yaml")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="docker")
    args = parser.parse_args()

    if not shutil.which(args.engine):
        raise SystemExit(f"{args.engine} not found in PATH")

    image = vector_image()
    config = vector_config()

    # Read rather than assume: a data_dir Vector cannot see aborts validation
    # before it ever reaches the transforms.
    match = re.search(r"^data_dir:\s*[\"']?([^\"'\n]+)", config, re.M)
    data_dir = match.group(1).strip() if match else "/vector-data-dir"

    env_vars = sorted(set(re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)", config)))

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = pathlib.Path(tmp)
        (tmp_path / "vector.yml").write_text(config)
        (tmp_path / "kubeconfig").write_text(KUBECONFIG_STUB)
        (tmp_path / "data").mkdir()

        cmd = [
            args.engine, "run", "--rm",
            "-v", f"{tmp_path / 'vector.yml'}:/etc/vector/vector.yml:ro",
            "-v", f"{tmp_path / 'data'}:{data_dir}",
            "-v", f"{tmp_path / 'kubeconfig'}:/root/.kube/config:ro",
        ]
        for name in env_vars:
            cmd += ["-e", f"{name}={PLACEHOLDERS.get(name, DEFAULT_PLACEHOLDER)}"]
        cmd += [
            image,
            "validate", "--skip-healthchecks",
            "--config-yaml", "/etc/vector/vector.yml",
        ]

        print(f"image     {image}")
        print(f"data_dir  {data_dir}")
        print(f"env       {', '.join(env_vars) or '(none)'}")
        print()

        result = subprocess.run(cmd)

    if result.returncode != 0:
        print(
            "\nVector refused this config. It would crashloop on deploy, and "
            "ArgoCD would wait on a DaemonSet that can never become healthy.",
            file=sys.stderr,
        )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
