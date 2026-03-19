"""Multi-ecosystem security audit parsing.

Normalizes output from npm, cargo, pip-audit, CodeQL, and Dependabot
into a unified severity model.
"""

from __future__ import annotations

from typing import Any

SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]

_SEVERITY_MAP = {
    "critical": "critical",
    "high": "high",
    "moderate": "medium",
    "medium": "medium",
    "low": "low",
    "info": "info",
    "informational": "info",
    "note": "low",
    "warning": "medium",
    "error": "high",
}


def normalize_severity(raw: str) -> str:
    """Map a raw severity label to a canonical value."""
    return _SEVERITY_MAP.get(raw.lower(), "medium") if raw else "medium"


def _empty_severities() -> dict[str, int]:
    return {s: 0 for s in SEVERITY_ORDER}


# ── npm / pnpm ──────────────────────────────────────────────────────

def parse_npm(raw: Any) -> dict:
    """Parse pnpm/npm audit JSON output."""
    advisories: list[dict] = []
    severities = _empty_severities()

    if not raw or not isinstance(raw, dict):
        return {"total": 0, "severities": severities, "advisories": []}

    # Classic pnpm format: { advisories: { id: {...} } }
    raw_advisories = raw.get("advisories", {})
    if isinstance(raw_advisories, dict):
        for _id, adv in raw_advisories.items():
            sev = normalize_severity(adv.get("severity", ""))
            severities[sev] += 1
            advisories.append({
                "id": str(_id),
                "title": adv.get("title", ""),
                "severity": sev,
                "package": adv.get("module_name", ""),
                "url": adv.get("url", ""),
            })

    # pnpm v10+ format: { vulnerabilities: { pkg: {...} } }
    if not advisories and "vulnerabilities" in raw:
        vulns = raw["vulnerabilities"]
        if isinstance(vulns, dict):
            for pkg_name, vuln in vulns.items():
                for via in vuln.get("via", []):
                    if isinstance(via, dict):
                        sev = normalize_severity(via.get("severity", ""))
                        severities[sev] += 1
                        advisories.append({
                            "id": str(via.get("source", "")),
                            "title": via.get("title", ""),
                            "severity": sev,
                            "package": pkg_name,
                            "url": via.get("url", ""),
                        })

    return {"total": len(advisories), "severities": severities,
            "advisories": advisories}


# ── Cargo ────────────────────────────────────────────────────────────

def parse_cargo(raw: Any) -> dict:
    """Parse ``cargo audit --json`` output."""
    advisories: list[dict] = []
    severities = _empty_severities()

    if not raw or not isinstance(raw, dict):
        return {"total": 0, "severities": severities, "advisories": []}

    for entry in raw.get("vulnerabilities", {}).get("list", []):
        adv = entry.get("advisory", {})
        sev = _cargo_severity(adv)
        severities[sev] += 1
        pkg = entry.get("package", {})
        advisories.append({
            "id": adv.get("id", ""),
            "title": adv.get("title", ""),
            "severity": sev,
            "package": pkg.get("name", ""),
            "url": adv.get("url", ""),
        })

    # Warnings (yanked, unmaintained, etc.)
    for warning_list in raw.get("warnings", {}).values():
        if isinstance(warning_list, list):
            for w in warning_list:
                adv = w.get("advisory", {})
                severities["info"] += 1
                pkg = w.get("package", {})
                advisories.append({
                    "id": adv.get("id", ""),
                    "title": adv.get("title", ""),
                    "severity": "info",
                    "package": pkg.get("name", ""),
                    "url": adv.get("url", ""),
                })

    return {"total": len(advisories), "severities": severities,
            "advisories": advisories}


def _cargo_severity(adv: dict) -> str:
    if adv.get("informational"):
        return "info"
    if adv.get("cvss"):
        try:
            score = float(str(adv["cvss"]))
        except ValueError:
            return "medium"
        if score >= 9.0:
            return "critical"
        if score >= 7.0:
            return "high"
        if score >= 4.0:
            return "medium"
    return "medium"


# ── Python (pip-audit) ───────────────────────────────────────────────

def parse_python(raw: Any) -> dict:
    """Parse ``pip-audit --format=json`` output."""
    advisories: list[dict] = []
    severities = _empty_severities()

    if not raw:
        return {"total": 0, "severities": severities, "advisories": []}

    deps = raw if isinstance(raw, list) else raw.get("dependencies", [])
    for dep in deps:
        for vuln in dep.get("vulns", []):
            sev = "medium"
            severities[sev] += 1
            vuln_id = vuln.get("id", "")
            advisories.append({
                "id": vuln_id,
                "title": vuln.get("description", vuln_id),
                "severity": sev,
                "package": dep.get("name", ""),
                "url": (
                    "https://osv.dev/vulnerability/" + vuln_id
                    if vuln_id else ""
                ),
            })

    return {"total": len(advisories), "severities": severities,
            "advisories": advisories}


# ── CodeQL ───────────────────────────────────────────────────────────

def parse_codeql(raw: Any) -> dict:
    """Parse GitHub code-scanning alerts API response."""
    alerts: list[dict] = []
    severities = _empty_severities()

    if not raw or not isinstance(raw, list):
        return {"total": 0, "severities": severities, "alerts": []}

    for alert in raw:
        rule = alert.get("rule", {})
        raw_sev = (rule.get("security_severity_level")
                   or rule.get("severity") or "medium")
        sev = normalize_severity(raw_sev)
        severities[sev] += 1
        location = alert.get(
            "most_recent_instance", {}).get("location", {})
        alerts.append({
            "rule_id": rule.get("id", ""),
            "description": rule.get("description", ""),
            "severity": sev,
            "path": location.get("path", ""),
            "url": alert.get("html_url", ""),
        })

    return {"total": len(alerts), "severities": severities,
            "alerts": alerts}


# ── Dependabot ───────────────────────────────────────────────────────

def parse_dependabot(raw: Any) -> dict:
    """Parse GitHub Dependabot alerts API response."""
    alerts: list[dict] = []
    severities = _empty_severities()

    if not raw or not isinstance(raw, list):
        return {"total": 0, "severities": severities, "alerts": []}

    for alert in raw:
        sec_vuln = alert.get("security_vulnerability", {})
        sev = normalize_severity(sec_vuln.get("severity", "medium"))
        severities[sev] += 1
        pkg = sec_vuln.get("package", {})
        adv = alert.get("security_advisory", {})
        alerts.append({
            "package": pkg.get("name", ""),
            "ecosystem": pkg.get("ecosystem", ""),
            "severity": sev,
            "summary": adv.get("summary", ""),
            "url": alert.get("html_url", ""),
        })

    return {"total": len(alerts), "severities": severities,
            "alerts": alerts}


# ── Aggregate ────────────────────────────────────────────────────────

def build_summary(ecosystems: dict[str, dict]) -> dict[str, int]:
    """Aggregate severity counts across all ecosystems."""
    total = _empty_severities()
    for eco in ecosystems.values():
        for sev in SEVERITY_ORDER:
            total[sev] += eco.get("severities", {}).get(sev, 0)
    return total


def parse_all_ecosystems(raw: dict) -> dict:
    """Parse a combined raw audit payload with all ecosystem keys.

    Expects a dict with optional keys: ``npm``, ``cargo``, ``python``,
    ``codeql``, ``dependabot``.

    Returns ``{"ecosystems": {...}, "summary": {...}}``.
    """
    ecosystems = {
        "npm": parse_npm(raw.get("npm", {})),
        "cargo": parse_cargo(raw.get("cargo", {})),
        "python": parse_python(raw.get("python", [])),
        "codeql": parse_codeql(raw.get("codeql", [])),
        "dependabot": parse_dependabot(raw.get("dependabot", [])),
    }
    return {
        "ecosystems": ecosystems,
        "summary": build_summary(ecosystems),
    }
