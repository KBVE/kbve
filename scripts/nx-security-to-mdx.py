#!/usr/bin/env python3
"""Aggregate security audit data into Starlight MDX and structured JSON.

Usage:
    nx-security-to-mdx.py --input <raw.json> --timestamp <ISO>
                           [--mdx-out <path>] [--json-out <path>]
"""
import argparse
import json
import sys

SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]

SEVERITY_ICONS = {
    "critical": "warning",
    "high": "error",
    "medium": "information",
    "low": "approve-check-circle",
}

ECOSYSTEM_ICONS = {
    "npm": "seti:npm",
    "cargo": "seti:rust",
    "python": "seti:python",
    "codeql": "magnifier",
    "dependabot": "github",
}

ECOSYSTEM_LABELS = {
    "npm": "npm",
    "cargo": "Cargo",
    "python": "Python",
    "codeql": "CodeQL",
    "dependabot": "Dependabot",
}


def normalize_severity(raw: str) -> str:
    """Normalize various severity labels to our canonical set."""
    mapping = {
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
    return mapping.get(raw.lower(), "medium") if raw else "medium"


def empty_severities() -> dict:
    return {s: 0 for s in SEVERITY_ORDER}


def parse_npm(raw) -> dict:
    """Parse pnpm audit JSON output."""
    advisories = []
    severities = empty_severities()

    if not raw or not isinstance(raw, dict):
        return {"total": 0, "severities": severities, "advisories": []}

    # pnpm audit --json produces { advisories: { id: {...} }, metadata: {...} }
    raw_advisories = raw.get("advisories", {})
    if isinstance(raw_advisories, dict):
        for _id, adv in raw_advisories.items():
            sev = normalize_severity(adv.get("severity", ""))
            severities[sev] = severities.get(sev, 0) + 1
            advisories.append({
                "id": str(_id),
                "title": adv.get("title", ""),
                "severity": sev,
                "package": adv.get("module_name", ""),
                "url": adv.get("url", ""),
            })

    # Also check pnpm v10+ format with "vulnerabilities" key
    if not advisories and "vulnerabilities" in raw:
        vulns = raw["vulnerabilities"]
        if isinstance(vulns, dict):
            for pkg_name, vuln in vulns.items():
                via_list = vuln.get("via", [])
                for via in via_list:
                    if isinstance(via, dict):
                        sev = normalize_severity(via.get("severity", ""))
                        severities[sev] = severities.get(sev, 0) + 1
                        advisories.append({
                            "id": str(via.get("source", "")),
                            "title": via.get("title", ""),
                            "severity": sev,
                            "package": pkg_name,
                            "url": via.get("url", ""),
                        })

    return {
        "total": len(advisories),
        "severities": severities,
        "advisories": advisories,
    }


def parse_cargo(raw) -> dict:
    """Parse cargo audit --json output."""
    advisories = []
    severities = empty_severities()

    if not raw or not isinstance(raw, dict):
        return {"total": 0, "severities": severities, "advisories": []}

    vuln_list = raw.get("vulnerabilities", {}).get("list", [])
    for entry in vuln_list:
        adv = entry.get("advisory", {})
        # Derive severity from informational flag or CVSS score
        if adv.get("informational"):
            sev = "info"
        elif adv.get("cvss"):
            cvss_raw = str(adv["cvss"])
            try:
                # cargo audit cvss is a vector string (CVSS:3.1/AV:N/...),
                # not a numeric score. Try float() in case a score is provided.
                score = float(cvss_raw)
            except ValueError:
                score = None
            if score is not None and score >= 9.0:
                sev = "critical"
            elif score is not None and score >= 7.0:
                sev = "high"
            elif score is not None and score >= 4.0:
                sev = "medium"
            else:
                sev = "medium"
        else:
            sev = "medium"

        severities[sev] = severities.get(sev, 0) + 1
        pkg = entry.get("package", {})
        advisories.append({
            "id": adv.get("id", ""),
            "title": adv.get("title", ""),
            "severity": sev,
            "package": pkg.get("name", ""),
            "url": adv.get("url", ""),
        })

    # Also check warnings (yanked crates, unmaintained, etc.)
    for warning in raw.get("warnings", {}).values():
        if isinstance(warning, list):
            for w in warning:
                adv = w.get("advisory", {})
                severities["info"] = severities.get("info", 0) + 1
                pkg = w.get("package", {})
                advisories.append({
                    "id": adv.get("id", ""),
                    "title": adv.get("title", ""),
                    "severity": "info",
                    "package": pkg.get("name", ""),
                    "url": adv.get("url", ""),
                })

    return {
        "total": len(advisories),
        "severities": severities,
        "advisories": advisories,
    }


def parse_python(raw) -> dict:
    """Parse pip-audit --format=json output."""
    advisories = []
    severities = empty_severities()

    if not raw:
        return {"total": 0, "severities": severities, "advisories": []}

    # pip-audit produces: { "dependencies": [...], "fixes": [...] }
    # or just an array of { name, version, vulns: [...] }
    deps = raw if isinstance(raw, list) else raw.get("dependencies", [])

    for dep in deps:
        for vuln in dep.get("vulns", []):
            # pip-audit doesn't provide severity, default to medium
            sev = "medium"
            severities[sev] += 1
            vuln_id = vuln.get("id", "")
            advisories.append({
                "id": vuln_id,
                "title": vuln.get("description", vuln_id),
                "severity": sev,
                "package": dep.get("name", ""),
                "url": f"https://osv.dev/vulnerability/{vuln_id}"
                if vuln_id else "",
            })

    return {
        "total": len(advisories),
        "severities": severities,
        "advisories": advisories,
    }


def parse_codeql(raw) -> dict:
    """Parse GitHub code scanning alerts API response."""
    alerts = []
    severities = empty_severities()

    if not raw or not isinstance(raw, list):
        return {"total": 0, "severities": severities, "alerts": []}

    for alert in raw:
        rule = alert.get("rule", {})
        # Prefer security_severity_level, fall back to severity
        raw_sev = (rule.get("security_severity_level")
                   or rule.get("severity")
                   or "medium")
        sev = normalize_severity(raw_sev)
        severities[sev] = severities.get(sev, 0) + 1

        location = alert.get("most_recent_instance", {}).get("location", {})
        alerts.append({
            "rule_id": rule.get("id", ""),
            "description": rule.get("description", ""),
            "severity": sev,
            "path": location.get("path", ""),
            "url": alert.get("html_url", ""),
        })

    return {
        "total": len(alerts),
        "severities": severities,
        "alerts": alerts,
    }


def parse_dependabot(raw) -> dict:
    """Parse GitHub Dependabot alerts API response."""
    alerts = []
    severities = empty_severities()

    if not raw or not isinstance(raw, list):
        return {"total": 0, "severities": severities, "alerts": []}

    for alert in raw:
        sec_vuln = alert.get("security_vulnerability", {})
        raw_sev = sec_vuln.get("severity", "medium")
        sev = normalize_severity(raw_sev)
        severities[sev] = severities.get(sev, 0) + 1

        pkg = sec_vuln.get("package", {})
        adv = alert.get("security_advisory", {})
        alerts.append({
            "package": pkg.get("name", ""),
            "ecosystem": pkg.get("ecosystem", ""),
            "severity": sev,
            "summary": adv.get("summary", ""),
            "url": alert.get("html_url", ""),
        })

    return {
        "total": len(alerts),
        "severities": severities,
        "alerts": alerts,
    }


def build_summary(ecosystems: dict) -> dict:
    """Aggregate severity counts across all ecosystems."""
    total = empty_severities()
    for eco in ecosystems.values():
        for sev in SEVERITY_ORDER:
            total[sev] += eco.get("severities", {}).get(sev, 0)
    return total


def write_json(data: dict, path: str):
    """Write structured security JSON."""
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    total = sum(data["summary"].values())
    print(f"JSON written to {path} ({total} total findings)")


def write_mdx(data: dict, timestamp: str, path: str):
    """Write Starlight MDX security report."""
    summary = data["summary"]
    ecosystems = data["ecosystems"]
    total = sum(summary.values())

    with open(path, "w") as out:
        # Frontmatter
        out.write(
            "---\n"
            "title: Security Audit Report\n"
            "description: |\n"
            "    Weekly auto-generated security audit"
            " for the KBVE monorepo.\n"
            "sidebar:\n"
            "    label: Security Audit\n"
            "    order: 102\n"
            "editUrl: false\n"
            "---\n\n"
        )

        # Imports
        out.write(
            "import { Card, CardGrid, Tabs, TabItem }"
            " from '@astrojs/starlight/components';\n\n"
        )

        # Header
        out.write("## Security Audit Report\n\n")
        out.write(
            ":::note[Auto-generated]\n"
            f"Last generated: **{timestamp}** — "
            "updated every Wednesday by `ci-nx-security`.\n"
            ":::\n\n"
        )

        # Status callout
        crit_high = summary["critical"] + summary["high"]
        if crit_high > 0:
            out.write(
                ":::caution[Action Required]\n"
                f"**{crit_high}** critical/high severity"
                f" finding{'s' if crit_high != 1 else ''}"
                " across the monorepo.\n"
                ":::\n\n"
            )
        elif total > 0:
            out.write(
                ":::note[Findings Present]\n"
                f"**{total}** finding{'s' if total != 1 else ''}"
                " found — none critical or high.\n"
                ":::\n\n"
            )
        else:
            out.write(
                ":::tip[All Clear]\n"
                "No security findings detected"
                " across any ecosystem.\n"
                ":::\n\n"
            )

        # Severity overview cards
        out.write("### Severity Overview\n\n")
        out.write("<CardGrid>\n")
        for sev in SEVERITY_ORDER[:4]:  # skip info for overview
            icon = SEVERITY_ICONS.get(sev, "information")
            count = summary[sev]
            label = sev.capitalize()
            out.write(
                f'  <Card title="{count} {label}" icon="{icon}">\n'
                f"    {label}-severity findings"
                f" across all ecosystems.\n"
                "  </Card>\n"
            )
        out.write("</CardGrid>\n\n")

        # Ecosystem breakdown cards
        out.write("### Ecosystem Breakdown\n\n")
        out.write("<CardGrid>\n")
        for eco_name in ["npm", "cargo", "python", "codeql", "dependabot"]:
            eco = ecosystems.get(eco_name, {})
            icon = ECOSYSTEM_ICONS.get(eco_name, "document")
            count = eco.get("total", 0)
            label = ECOSYSTEM_LABELS.get(eco_name, eco_name.capitalize())
            item_word = "alerts" if eco_name in (
                "codeql", "dependabot") else "advisories"
            out.write(
                f'  <Card title="{label}" icon="{icon}">\n'
                f"    **{count}** {item_word}\n"
                "  </Card>\n"
            )
        out.write("</CardGrid>\n\n")

        # Tabbed content
        out.write("<Tabs>\n")

        # Summary tab
        out.write('  <TabItem label="Summary">\n\n')
        out.write(
            "| Ecosystem | Critical | High | Medium | Low | Total |\n"
            "|-----------|:--------:|:----:|:------:|:---:|:-----:|\n"
        )
        for eco_name in ["npm", "cargo", "python", "codeql", "dependabot"]:
            eco = ecosystems.get(eco_name, {})
            sevs = eco.get("severities", empty_severities())
            eco_total = eco.get("total", 0)
            label = ECOSYSTEM_LABELS.get(eco_name, eco_name.capitalize())
            out.write(
                f"| **{label}** "
                f"| {sevs.get('critical', 0)} "
                f"| {sevs.get('high', 0)} "
                f"| {sevs.get('medium', 0)} "
                f"| {sevs.get('low', 0)} "
                f"| {eco_total} |\n"
            )
        out.write(
            f"| **Total** "
            f"| {summary['critical']} "
            f"| {summary['high']} "
            f"| {summary['medium']} "
            f"| {summary['low']} "
            f"| {total} |\n"
        )
        out.write("\n  </TabItem>\n")

        # Per-ecosystem tabs
        _write_npm_tab(out, ecosystems.get("npm", {}))
        _write_cargo_tab(out, ecosystems.get("cargo", {}))
        _write_python_tab(out, ecosystems.get("python", {}))
        _write_codeql_tab(out, ecosystems.get("codeql", {}))
        _write_dependabot_tab(out, ecosystems.get("dependabot", {}))

        out.write("</Tabs>\n\n")

        # Footer
        out.write("---\n\n")
        out.write(
            "*Auto-generated by "
            "[ci-nx-security.yml]"
            "(https://github.com/KBVE/kbve/actions/"
            "workflows/ci-nx-security.yml)*\n"
        )

    print(f"MDX written to {path} ({total} total findings)")


def _write_advisory_tab(out, label: str, eco: dict, key: str = "advisories"):
    """Write a tab for advisory-style ecosystems (npm/cargo/python)."""
    out.write(f'  <TabItem label="{label}">\n\n')
    items = eco.get(key, [])
    if not items:
        out.write(
            f":::tip[All Clear]\n"
            f"No {label.lower()} advisories found.\n"
            ":::\n\n"
        )
    else:
        out.write(
            "| Severity | Package | Advisory | Link |\n"
            "|----------|---------|----------|------|\n"
        )
        for item in sorted(items, key=lambda x: SEVERITY_ORDER.index(
                x.get("severity", "medium"))):
            sev = item.get("severity", "medium").capitalize()
            pkg = item.get("package", "")
            title = item.get("title", item.get("id", ""))
            # Truncate long titles
            if len(title) > 60:
                title = title[:57] + "..."
            url = item.get("url", "")
            link = f"[Details]({url})" if url else ""
            out.write(f"| {sev} | `{pkg}` | {title} | {link} |\n")
        out.write("\n")
    out.write("  </TabItem>\n")


def _write_npm_tab(out, eco: dict):
    _write_advisory_tab(out, "npm", eco)


def _write_cargo_tab(out, eco: dict):
    _write_advisory_tab(out, "Cargo", eco)


def _write_python_tab(out, eco: dict):
    _write_advisory_tab(out, "Python", eco)


def _write_codeql_tab(out, eco: dict):
    """Write CodeQL alerts tab."""
    out.write('  <TabItem label="CodeQL">\n\n')
    alerts = eco.get("alerts", [])
    if not alerts:
        out.write(
            ":::tip[All Clear]\n"
            "No open CodeQL alerts.\n"
            ":::\n\n"
        )
    else:
        out.write(
            "| Severity | Rule | Path | Link |\n"
            "|----------|------|------|------|\n"
        )
        for alert in sorted(alerts, key=lambda x: SEVERITY_ORDER.index(
                x.get("severity", "medium"))):
            sev = alert.get("severity", "medium").capitalize()
            rule = alert.get("rule_id", "")
            path = alert.get("path", "")
            # Truncate long paths
            if len(path) > 50:
                path = "..." + path[-47:]
            url = alert.get("url", "")
            link = f"[Details]({url})" if url else ""
            out.write(f"| {sev} | `{rule}` | `{path}` | {link} |\n")
        out.write("\n")
    out.write("  </TabItem>\n")


def _write_dependabot_tab(out, eco: dict):
    """Write Dependabot alerts tab."""
    out.write('  <TabItem label="Dependabot">\n\n')
    alerts = eco.get("alerts", [])
    if not alerts:
        out.write(
            ":::tip[All Clear]\n"
            "No open Dependabot alerts.\n"
            ":::\n\n"
        )
    else:
        out.write(
            "| Severity | Package | Ecosystem | Summary | Link |\n"
            "|----------|---------|-----------|---------|------|\n"
        )
        for alert in sorted(alerts, key=lambda x: SEVERITY_ORDER.index(
                x.get("severity", "medium"))):
            sev = alert.get("severity", "medium").capitalize()
            pkg = alert.get("package", "")
            eco_name = alert.get("ecosystem", "")
            summary = alert.get("summary", "")
            if len(summary) > 50:
                summary = summary[:47] + "..."
            url = alert.get("url", "")
            link = f"[Details]({url})" if url else ""
            out.write(
                f"| {sev} | `{pkg}` | {eco_name}"
                f" | {summary} | {link} |\n"
            )
        out.write("\n")
    out.write("  </TabItem>\n")


def main():
    parser = argparse.ArgumentParser(
        description="Aggregate security audit data into MDX and JSON.")
    parser.add_argument(
        "--input", required=True,
        help="Path to aggregated raw security JSON")
    parser.add_argument(
        "--mdx-out",
        help="Path to write Starlight MDX output")
    parser.add_argument(
        "--json-out",
        help="Path to write structured JSON output")
    parser.add_argument(
        "--timestamp", required=True,
        help="ISO 8601 timestamp for the report")
    args = parser.parse_args()

    if not args.mdx_out and not args.json_out:
        print("Error: at least one of --mdx-out or --json-out required",
              file=sys.stderr)
        sys.exit(1)

    with open(args.input) as f:
        raw = json.load(f)

    ecosystems = {
        "npm": parse_npm(raw.get("npm", {})),
        "cargo": parse_cargo(raw.get("cargo", {})),
        "python": parse_python(raw.get("python", [])),
        "codeql": parse_codeql(raw.get("codeql", [])),
        "dependabot": parse_dependabot(raw.get("dependabot", [])),
    }

    data = {
        "generated_at": args.timestamp,
        "summary": build_summary(ecosystems),
        "ecosystems": ecosystems,
    }

    if args.json_out:
        write_json(data, args.json_out)
    if args.mdx_out:
        write_mdx(data, args.timestamp, args.mdx_out)


if __name__ == "__main__":
    main()
