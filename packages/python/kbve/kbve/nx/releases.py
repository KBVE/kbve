"""Release radar — manifest versions vs published registry versions.

Reads ``.github/ci-dispatch-manifest.json`` (the source of publishable
crates / npm / python packages) and compares each declared version against
the latest published version on its registry (crates.io / npm / PyPI). Drift
is classified: ``pending`` (local ahead — awaiting publish), ``published``
(in sync), ``behind`` (registry ahead), or ``unpublished`` (not on registry).
Registry fetches are public HTTP; the pure :func:`classify` /
:func:`aggregate` are unit-tested via the route's ``inputs`` seam.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = "kbve-ci-daily-content-fetch/1.0"
_SENTINELS = {"", "0.0.0"}

REGISTRIES = {
    "crates": ("Crates.io", "https://crates.io/api/v1/crates/{name}"),
    "npm": ("npm", "https://registry.npmjs.org/{name}"),
    "python": ("PyPI", "https://pypi.org/pypi/{name}/json"),
}


def _get_json(url: str, timeout: float) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                               "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def registry_latest(eco: str, name: str, timeout: float = 20.0) -> str | None:
    """Latest published version for ``name`` on ``eco``'s registry."""
    _, tmpl = REGISTRIES[eco]
    data = _get_json(tmpl.format(name=name), timeout)
    if data is None:
        return None
    if eco == "crates":
        crate = data.get("crate") or {}
        return crate.get("max_stable_version") or crate.get("max_version")
    if eco == "npm":
        return (data.get("dist-tags") or {}).get("latest")
    if eco == "python":
        return (data.get("info") or {}).get("version")
    return None


def _vtuple(v: str) -> tuple:
    parts = []
    for chunk in (v or "").split("."):
        num = "".join(ch for ch in chunk if ch.isdigit())
        parts.append(int(num) if num else 0)
    return tuple(parts)


def classify(local: str, published: str | None) -> str:
    """Bucket local-vs-published into pending/published/behind/unpublished."""
    if local in _SENTINELS:
        return "skipped"
    if published is None:
        return "unpublished"
    if local == published:
        return "published"
    return "pending" if _vtuple(local) > _vtuple(published) else "behind"


def load_manifest(repo_root: Path) -> dict:
    """Load ``.github/ci-dispatch-manifest.json`` (empty dict if missing)."""
    path = Path(repo_root) / ".github" / "ci-dispatch-manifest.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def _name_of(eco: str, entry: dict) -> str:
    return entry.get("package_name") or entry.get("crate_name") \
        or entry.get("key") or ""


def _registry_name(eco: str, entry: dict, display: str) -> str:
    if eco == "python":
        return entry.get("pypi_name") or display
    return display


def resolve(manifest: dict, fetch=registry_latest,
            timeout: float = 20.0) -> list[dict]:
    """Compare every crates/npm/python manifest entry to its registry."""
    rows: list[dict] = []
    for eco in ("crates", "npm", "python"):
        for entry in manifest.get(eco, []):
            name = _name_of(eco, entry)
            local = str(entry.get("version", ""))
            if not name:
                continue
            if local in _SENTINELS:
                published, status = None, "skipped"
            else:
                reg_name = _registry_name(eco, entry, name)
                try:
                    published = fetch(eco, reg_name, timeout)
                except Exception:  # noqa: BLE001 — degrade per-package
                    published = None
                status = classify(local, published)
            rows.append({
                "ecosystem": eco,
                "name": name,
                "local": local,
                "published": published,
                "status": status,
            })
    rows.sort(key=lambda r: (r["ecosystem"], r["name"]))
    return rows


_STATUSES = ("pending", "behind", "unpublished", "published", "skipped")


def aggregate(rows: list[dict]) -> dict:
    """Summarize resolved rows into status + per-ecosystem counts."""
    summary = {s: 0 for s in _STATUSES}
    per_eco: dict[str, dict] = {}
    for r in rows:
        summary[r["status"]] = summary.get(r["status"], 0) + 1
        eco = per_eco.setdefault(r["ecosystem"], {"total": 0, "pending": 0})
        eco["total"] += 1
        if r["status"] == "pending":
            eco["pending"] += 1
    return {
        "summary": summary,
        "ecosystems": per_eco,
        "rows": rows,
        "total": len(rows),
    }
