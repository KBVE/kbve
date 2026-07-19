"""Render parsed Nx security and graph data into Starlight MDX and JSON.

The parse layer (:mod:`kbve.nx.security`, :mod:`kbve.nx.graph`) produces
plain data; these renderers turn that data into the exact MDX/JSON emitted
by the ``ci-daily-content`` workflow (router → builder routes).
"""

from __future__ import annotations

import json
from typing import TextIO

from ..mdx.escape import escape_mdx
from .graph import GraphData, mermaid_id, top_hubs
from .security import SEVERITY_ORDER

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

TYPE_STYLES = {
    "app": (":::app", "fill:#3b82f6,stroke:#1d4ed8,color:#fff"),
    "lib": (":::lib", "fill:#10b981,stroke:#059669,color:#fff"),
    "e2e": (":::e2e", "fill:#f59e0b,stroke:#d97706,color:#fff"),
}

TYPE_ICONS = {
    "app": "rocket",
    "lib": "puzzle",
    "e2e": "approve-check-circle",
}


def _empty_severities() -> dict[str, int]:
    return {s: 0 for s in SEVERITY_ORDER}


# ── Security ─────────────────────────────────────────────────────────

def render_security_json(data: dict) -> str:
    """Serialize the structured security payload to JSON."""
    return json.dumps(data, indent=2)


def render_security_mdx(data: dict, timestamp: str) -> str:
    """Render the Starlight MDX security report."""
    from io import StringIO

    summary = data["summary"]
    ecosystems = data["ecosystems"]
    total = sum(summary.values())
    out = StringIO()

    out.write(
        "---\n"
        "title: Security Audit Report\n"
        "description: |\n"
        "    Daily auto-generated security audit"
        " for the KBVE monorepo.\n"
        "sidebar:\n"
        "    label: Security\n"
        "    order: 102\n"
        "editUrl: false\n"
        "---\n\n"
    )
    out.write(
        "import { Card, CardGrid, Tabs, TabItem }"
        " from '@astrojs/starlight/components';\n\n"
    )
    out.write("## Security Audit Report\n\n")
    out.write(
        ":::note[Auto-generated]\n"
        f"Last generated: **{timestamp}** — "
        "updated daily by `ci-daily-content`.\n"
        ":::\n\n"
    )

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

    out.write("### Severity Overview\n\n")
    out.write("<CardGrid>\n")
    for sev in SEVERITY_ORDER[:4]:
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

    has_findings = any(summary[s] > 0 for s in SEVERITY_ORDER[:4])
    if has_findings:
        out.write("### Severity Distribution\n\n")
        out.write("```mermaid\n")
        out.write("pie showData\n")
        out.write("    title Findings by Severity\n")
        for sev in SEVERITY_ORDER[:4]:
            if summary[sev] > 0:
                out.write(f'    "{sev.capitalize()}" : {summary[sev]}\n')
        out.write("```\n\n")

    eco_totals = {
        ECOSYSTEM_LABELS[e]: ecosystems.get(e, {}).get("total", 0)
        for e in ["npm", "cargo", "python", "codeql", "dependabot"]
    }
    if any(v > 0 for v in eco_totals.values()):
        out.write("### Findings by Ecosystem\n\n")
        out.write("```mermaid\n")
        out.write("pie showData\n")
        out.write("    title Findings by Ecosystem\n")
        for label, count in eco_totals.items():
            if count > 0:
                out.write(f'    "{label}" : {count}\n')
        out.write("```\n\n")

    out.write("<Tabs>\n")

    out.write('  <TabItem label="Summary">\n\n')
    out.write(
        "| Ecosystem | Critical | High | Medium | Low | Total |\n"
        "|-----------|:--------:|:----:|:------:|:---:|:-----:|\n"
    )
    for eco_name in ["npm", "cargo", "python", "codeql", "dependabot"]:
        eco = ecosystems.get(eco_name, {})
        sevs = eco.get("severities", _empty_severities())
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

    _write_advisory_tab(out, "npm", ecosystems.get("npm", {}))
    _write_advisory_tab(out, "Cargo", ecosystems.get("cargo", {}))
    _write_advisory_tab(out, "Python", ecosystems.get("python", {}))
    _write_codeql_tab(out, ecosystems.get("codeql", {}))
    _write_dependabot_tab(out, ecosystems.get("dependabot", {}))

    out.write("</Tabs>\n\n")

    out.write("---\n\n")
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n"
    )

    return out.getvalue()


def _write_advisory_tab(out: TextIO, label: str, eco: dict,
                        key: str = "advisories") -> None:
    out.write(f'  <TabItem label="{label}">\n\n')
    items = eco.get(key, [])
    if not items:
        out.write(
            ":::tip[All Clear]\n"
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
            if len(title) > 60:
                title = title[:57] + "..."
            title = escape_mdx(title)
            url = item.get("url", "")
            link = f"[Details]({url})" if url else ""
            out.write(f"| {sev} | `{pkg}` | {title} | {link} |\n")
        out.write("\n")
    out.write("  </TabItem>\n")


def _write_codeql_tab(out: TextIO, eco: dict) -> None:
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
            if len(path) > 50:
                path = "..." + path[-47:]
            url = alert.get("url", "")
            link = f"[Details]({url})" if url else ""
            out.write(f"| {sev} | `{rule}` | `{path}` | {link} |\n")
        out.write("\n")
    out.write("  </TabItem>\n")


def _write_dependabot_tab(out: TextIO, eco: dict) -> None:
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


# ── Graph ────────────────────────────────────────────────────────────

def render_graph_mdx(graph: GraphData, timestamp: str) -> str:
    """Render the Starlight MDX Nx dependency-graph page."""
    from io import StringIO

    nodes = graph.nodes
    deps = graph.deps
    by_type = graph.by_type
    rows = graph.rows
    seen_edges = graph.edges
    edges_by_source = graph.edges_by_source
    top_depended = top_hubs(rows, 5)
    out = StringIO()

    out.write(
        "---\n"
        "title: NX Dependency Graph\n"
        "description: |\n"
        "    Daily auto-generated NX project dependency graph"
        " for the KBVE monorepo.\n"
        "sidebar:\n"
        "    label: Graph\n"
        "    order: 101\n"
        "editUrl: false\n"
        "---\n\n"
    )
    out.write(
        "import { Card, CardGrid, Tabs, TabItem }"
        " from '@astrojs/starlight/components';\n\n"
    )
    out.write("## NX Dependency Graph\n\n")
    out.write(
        ":::note[Auto-generated]\n"
        f"Last generated: **{timestamp}** — "
        "updated daily by `ci-daily-content`.\n"
        ":::\n\n"
    )

    out.write("<CardGrid>\n")
    for ptype in sorted(by_type):
        icon = TYPE_ICONS.get(ptype, "document")
        count = len(by_type[ptype])
        label = ptype.capitalize() + ("s" if count != 1 else "")
        out.write(f'  <Card title="{count} {label}" icon="{icon}">\n')
        names = ", ".join(sorted(by_type[ptype])[:6])
        if len(by_type[ptype]) > 6:
            names += f" + {len(by_type[ptype]) - 6} more"
        out.write(f"    {names}\n")
        out.write("  </Card>\n")
    out.write(
        f'  <Card title="{len(seen_edges)} Dependencies" icon="random">\n'
        f"    Across {len(nodes)} projects in the monorepo.\n"
        "  </Card>\n"
    )
    out.write("</CardGrid>\n\n")

    out.write("### Most Depended-On Projects\n\n")
    out.write("<CardGrid>\n")
    for row in top_depended:
        if row.dependent_count == 0:
            continue
        icon = TYPE_ICONS.get(row.project_type, "document")
        out.write(
            f'  <Card title="{row.name}" icon="{icon}">\n'
            f"    **{row.dependent_count}** project"
            f"{'s' if row.dependent_count != 1 else ''}"
            f" depend on this {row.project_type}."
            f" Located at `{row.root}`.\n"
            "  </Card>\n"
        )
    out.write("</CardGrid>\n\n")

    out.write("### Project Distribution\n\n")
    out.write("```mermaid\n")
    out.write("pie showData\n")
    out.write("    title Projects by Type\n")
    for ptype in sorted(by_type):
        label = ptype.capitalize() + "s"
        out.write(f'    "{label}" : {len(by_type[ptype])}\n')
    out.write("```\n\n")

    if top_depended and top_depended[0].dependent_count > 0:
        out.write("### Hub Connectivity\n\n")
        out.write("```mermaid\n")
        out.write("pie showData\n")
        out.write("    title Dependents per Hub\n")
        for row in top_depended:
            if row.dependent_count > 0:
                out.write(f'    "{row.name}" : {row.dependent_count}\n')
        out.write("```\n\n")

    out.write("<Tabs>\n")
    out.write('  <TabItem label="Diagram">\n\n')

    if len(seen_edges) <= 200:
        mermaid_lines = ["graph LR"]
        for ptype, (_, style) in TYPE_STYLES.items():
            mermaid_lines.append(f"    classDef {ptype} {style}")
        for src, targets in sorted(edges_by_source.items()):
            src_id = mermaid_id(src)
            for tgt in sorted(targets):
                tgt_id = mermaid_id(tgt)
                mermaid_lines.append(
                    f'    {src_id}["{src}"]'
                    f' --> {tgt_id}["{tgt}"]'
                )
        for ptype, node_names in by_type.items():
            if ptype in TYPE_STYLES:
                ids = ",".join(mermaid_id(n) for n in node_names)
                mermaid_lines.append("    class {} {}".format(ids, ptype))

        out.write("```mermaid\n")
        out.write("\n".join(mermaid_lines))
        out.write("\n```\n\n")
        out.write(
            ":::tip[Legend]\n"
            "**Blue** = Application &nbsp; "
            "**Green** = Library &nbsp; "
            "**Amber** = E2E Test\n"
            ":::\n\n"
        )
    else:
        out.write(
            ":::caution\n"
            "Dependency diagram omitted — "
            "too many edges for inline rendering.\n"
            ":::\n\n"
        )

    out.write("  </TabItem>\n")
    out.write('  <TabItem label="Project Index">\n\n')

    out.write(
        "| Project | Type | Root | Deps | Dependents |\n"
        "|---------|------|------|:----:|:----------:|\n"
    )
    for row in rows:
        out.write(
            f"| **{row.name}** | {row.project_type} | `{row.root}` "
            f"| {row.dep_count} | {row.dependent_count} |\n"
        )
    out.write("\n")

    out.write("  </TabItem>\n")
    out.write('  <TabItem label="Details">\n\n')

    for ptype in sorted(by_type):
        type_projects = [
            n for n in sorted(by_type[ptype]) if deps.get(n)
        ]
        if not type_projects:
            continue
        out.write(f"#### {ptype.capitalize()} Projects\n\n")
        for name in type_projects:
            dep_list = deps[name]
            out.write("<details>\n")
            out.write(
                f"<summary><strong>{name}</strong>"
                f" ({len(dep_list)} dep"
                f"{'s' if len(dep_list) != 1 else ''})"
                "</summary>\n\n"
            )
            out.write("| Target | Type |\n|--------|------|\n")
            for d in sorted(dep_list, key=lambda x: x["target"]):
                out.write(f"| {d['target']} | {d['type']} |\n")
            out.write("\n</details>\n\n")

    out.write("  </TabItem>\n")
    out.write("</Tabs>\n\n")

    out.write("---\n\n")
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n"
    )

    return out.getvalue()
