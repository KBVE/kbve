"""Fudster CLI — thin wrapper around kbve core modules.

Entry point: ``fudster`` (registered via ``[project.scripts]``).

Usage::

    fudster nx graph-to-mdx <graph.json> <output.mdx> <timestamp>
    fudster nx security-to-mdx --input <raw.json> --timestamp <ISO> \
        [--mdx-out <path>] [--json-out <path>]
"""

from __future__ import annotations

import json

import click

from kbve.mdx import MdxWriter
from kbve.nx.graph import (
    GraphData,
    mermaid_id,
    parse_graph,
    top_hubs,
)
from kbve.nx.security import (
    SEVERITY_ORDER,
    parse_all_ecosystems,
)


# ── Mermaid / MDX style constants ────────────────────────────────────

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


# ── Root CLI group ───────────────────────────────────────────────────

@click.group()
def main() -> None:
    """Fudster CLI — workspace tooling powered by kbve core."""


# ── version ──────────────────────────────────────────────────────────

@main.command()
def version() -> None:
    """Show fudster and kbve versions."""
    import fudster as _fudster
    import kbve as _kbve
    click.echo(f"fudster {_fudster.__version__}")
    click.echo(f"kbve    {_kbve.__version__}")


# ── info ─────────────────────────────────────────────────────────────

@main.command()
@click.option(
    "--json", "as_json", is_flag=True, default=False,
    help="Output as JSON instead of a table.",
)
def info(as_json: bool) -> None:
    """Show available kbve modules and their status."""
    from kbve.utils.module_info import list_modules

    modules = list_modules()

    if as_json:
        import json as _json
        data = [
            {"name": m.name, "description": m.description,
             "available": m.available}
            for m in modules
        ]
        click.echo(_json.dumps(data, indent=2))
    else:
        click.echo("kbve modules:\n")
        for m in modules:
            status = click.style("ok", fg="green") if m.available \
                else click.style("missing", fg="red")
            click.echo(f"  [{status}] {m.name}")
            click.echo(f"         {m.description}")
        click.echo()


# ── nx sub-group ─────────────────────────────────────────────────────

@main.group()
def nx() -> None:
    """Nx workspace commands."""


# ── nx graph-to-mdx ─────────────────────────────────────────────────

@nx.command("graph-to-mdx")
@click.argument("graph_json", type=click.Path(exists=True))
@click.argument("output_mdx", type=click.Path())
@click.argument("timestamp")
def graph_to_mdx(
    graph_json: str, output_mdx: str, timestamp: str,
) -> None:
    """Generate a Starlight MDX page from an Nx graph JSON file."""
    gd: GraphData = parse_graph(graph_json)
    hubs = top_hubs(gd.rows)

    w = MdxWriter()
    w.frontmatter(
        title="NX Dependency Graph",
        description="Daily auto-generated NX project dependency graph"
        " for the KBVE monorepo.",
        sidebar={"label": "Graph", "order": 101},
        editUrl=False,
    )
    w.imports(
        "Card", "CardGrid", "Tabs", "TabItem",
        source="@astrojs/starlight/components",
    )

    w.heading("NX Dependency Graph")
    w.admonition(
        "note", "Auto-generated",
        f"Last generated: **{timestamp}** — "
        "updated daily by `ci-dashboard`.",
    )

    # Overview cards
    w.card_grid_start()
    for ptype in sorted(gd.by_type):
        icon = TYPE_ICONS.get(ptype, "document")
        count = len(gd.by_type[ptype])
        label = ptype.capitalize() + ("s" if count != 1 else "")
        names = ", ".join(sorted(gd.by_type[ptype])[:6])
        if len(gd.by_type[ptype]) > 6:
            names += f" + {len(gd.by_type[ptype]) - 6} more"
        w.card(f"{count} {label}", icon, names)
    w.card(
        f"{len(gd.edges)} Dependencies", "random",
        f"Across {len(gd.nodes)} projects in the monorepo.",
    )
    w.card_grid_end()

    # Top hubs
    w.heading("Most Depended-On Projects", level=3)
    w.card_grid_start()
    for row in hubs:
        if row.dependent_count == 0:
            continue
        icon = TYPE_ICONS.get(row.project_type, "document")
        w.card(
            row.name, icon,
            f"**{row.dependent_count}** project"
            f"{'s' if row.dependent_count != 1 else ''}"
            f" depend on this {row.project_type}."
            f" Located at `{row.root}`.",
        )
    w.card_grid_end()

    # Distribution pie
    w.heading("Project Distribution", level=3)
    w.mermaid_pie(
        "Projects by Type",
        {ptype.capitalize() + "s": len(gd.by_type[ptype])
         for ptype in sorted(gd.by_type)},
    )

    # Hub connectivity pie
    if hubs and hubs[0].dependent_count > 0:
        w.heading("Hub Connectivity", level=3)
        w.mermaid_pie(
            "Dependents per Hub",
            {r.name: r.dependent_count
             for r in hubs if r.dependent_count > 0},
        )

    # Tabs: Diagram + Project Index + Details
    w.tabs_start()
    w.tab_start("Diagram")
    if len(gd.edges) <= 200:
        mermaid_lines = ["graph LR"]
        for ptype, (_, style) in TYPE_STYLES.items():
            mermaid_lines.append(f"    classDef {ptype} {style}")
        for src, targets in sorted(gd.edges_by_source.items()):
            src_id = mermaid_id(src)
            for tgt in sorted(targets):
                tgt_id = mermaid_id(tgt)
                mermaid_lines.append(
                    f'    {src_id}["{src}"] --> {tgt_id}["{tgt}"]'
                )
        for ptype, node_names in gd.by_type.items():
            if ptype in TYPE_STYLES:
                ids = ",".join(mermaid_id(n) for n in node_names)
                cls_kw = "class"
                mermaid_lines.append(
                    f"    {cls_kw} {ids} {ptype}"
                )
        w.mermaid_graph(mermaid_lines)
        w.admonition(
            "tip", "Legend",
            "**Blue** = Application &nbsp; "
            "**Green** = Library &nbsp; "
            "**Amber** = E2E Test",
        )
    else:
        w.admonition(
            "caution", "",
            "Dependency diagram omitted — "
            "too many edges for inline rendering.",
        )
    w.tab_end()

    w.tab_start("Project Index")
    w.table(
        ["Project", "Type", "Root", "Deps", "Dependents"],
        [[f"**{r.name}**", r.project_type, f"`{r.root}`",
          str(r.dep_count), str(r.dependent_count)]
         for r in gd.rows],
        ["left", "left", "left", "center", "center"],
    )
    w.tab_end()

    w.tab_start("Details")
    for ptype in sorted(gd.by_type):
        type_projects = [
            n for n in sorted(gd.by_type[ptype])
            if gd.deps.get(n)
        ]
        if not type_projects:
            continue
        w.heading(f"{ptype.capitalize()} Projects", level=4)
        for name in type_projects:
            dep_list = gd.deps[name]
            w.details_start(
                f"<strong>{name}</strong>"
                f" ({len(dep_list)} dep"
                f"{'s' if len(dep_list) != 1 else ''})"
            )
            w.table(
                ["Target", "Type"],
                [[d["target"], d["type"]]
                 for d in sorted(dep_list, key=lambda x: x["target"])],
            )
            w.details_end()
    w.tab_end()
    w.tabs_end()

    w.text("---")
    w.text(
        "*Auto-generated by "
        "[ci-dashboard.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-dashboard.yml)*"
    )

    w.write_to(output_mdx)
    click.echo(
        f"Generated {output_mdx}"
        f" — {len(gd.nodes)} projects, {len(gd.edges)} edges"
    )


# ── nx security-to-mdx ──────────────────────────────────────────────

@nx.command("security-to-mdx")
@click.option("--input", "input_path", required=True,
              type=click.Path(exists=True),
              help="Path to aggregated raw security JSON.")
@click.option("--timestamp", required=True,
              help="ISO 8601 timestamp for the report.")
@click.option("--mdx-out", type=click.Path(), default=None,
              help="Path to write Starlight MDX output.")
@click.option("--json-out", type=click.Path(), default=None,
              help="Path to write structured JSON output.")
def security_to_mdx(
    input_path: str,
    timestamp: str,
    mdx_out: str | None,
    json_out: str | None,
) -> None:
    """Aggregate security audit data into Starlight MDX and/or JSON."""
    if not mdx_out and not json_out:
        raise click.UsageError(
            "At least one of --mdx-out or --json-out is required."
        )

    with open(input_path) as f:
        raw = json.load(f)

    result = parse_all_ecosystems(raw)
    data = {
        "generated_at": timestamp,
        "summary": result["summary"],
        "ecosystems": result["ecosystems"],
    }

    if json_out:
        with open(json_out, "w") as f:
            json.dump(data, f, indent=2)
        total = sum(data["summary"].values())
        click.echo(f"JSON written to {json_out} ({total} total findings)")

    if mdx_out:
        _write_security_mdx(data, timestamp, mdx_out)


def _write_security_mdx(
    data: dict, timestamp: str, path: str,
) -> None:
    """Render the security report as Starlight MDX."""
    from kbve.mdx.escape import escape_mdx

    summary = data["summary"]
    ecosystems = data["ecosystems"]
    total = sum(summary.values())

    w = MdxWriter()
    w.frontmatter(
        title="Security Audit Report",
        description="Daily auto-generated security audit"
        " for the KBVE monorepo.",
        sidebar={"label": "Security", "order": 102},
        editUrl=False,
    )
    w.imports(
        "Card", "CardGrid", "Tabs", "TabItem",
        source="@astrojs/starlight/components",
    )

    w.heading("Security Audit Report")
    w.admonition(
        "note", "Auto-generated",
        f"Last generated: **{timestamp}** — "
        "updated daily by `ci-dashboard`.",
    )

    crit_high = summary["critical"] + summary["high"]
    if crit_high > 0:
        w.admonition(
            "caution", "Action Required",
            f"**{crit_high}** critical/high severity"
            f" finding{'s' if crit_high != 1 else ''}"
            " across the monorepo.",
        )
    elif total > 0:
        w.admonition(
            "note", "Findings Present",
            f"**{total}** finding{'s' if total != 1 else ''}"
            " found — none critical or high.",
        )
    else:
        w.admonition(
            "tip", "All Clear",
            "No security findings detected across any ecosystem.",
        )

    # Severity overview cards
    w.heading("Severity Overview", level=3)
    w.card_grid_start()
    for sev in SEVERITY_ORDER[:4]:
        icon = SEVERITY_ICONS.get(sev, "information")
        count = summary[sev]
        label = sev.capitalize()
        w.card(f"{count} {label}", icon,
               f"{label}-severity findings across all ecosystems.")
    w.card_grid_end()

    # Ecosystem breakdown cards
    w.heading("Ecosystem Breakdown", level=3)
    w.card_grid_start()
    for eco_name in ["npm", "cargo", "python", "codeql", "dependabot"]:
        eco = ecosystems.get(eco_name, {})
        icon = ECOSYSTEM_ICONS.get(eco_name, "document")
        count = eco.get("total", 0)
        label = ECOSYSTEM_LABELS.get(eco_name, eco_name.capitalize())
        item_word = ("alerts" if eco_name in ("codeql", "dependabot")
                     else "advisories")
        w.card(label, icon, f"**{count}** {item_word}")
    w.card_grid_end()

    # Severity pie
    has_findings = any(summary[s] > 0 for s in SEVERITY_ORDER[:4])
    if has_findings:
        w.heading("Severity Distribution", level=3)
        w.mermaid_pie(
            "Findings by Severity",
            {s.capitalize(): summary[s] for s in SEVERITY_ORDER[:4]},
        )

    # Ecosystem pie
    eco_totals = {
        ECOSYSTEM_LABELS[e]: ecosystems.get(e, {}).get("total", 0)
        for e in ["npm", "cargo", "python", "codeql", "dependabot"]
    }
    if any(v > 0 for v in eco_totals.values()):
        w.heading("Findings by Ecosystem", level=3)
        w.mermaid_pie("Findings by Ecosystem", eco_totals)

    # Summary + per-ecosystem tabs
    w.tabs_start()

    w.tab_start("Summary")
    _empty = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    rows = []
    for eco_name in ["npm", "cargo", "python", "codeql", "dependabot"]:
        eco = ecosystems.get(eco_name, {})
        sevs = eco.get("severities", _empty)
        eco_total = eco.get("total", 0)
        label = ECOSYSTEM_LABELS.get(eco_name, eco_name.capitalize())
        rows.append([
            f"**{label}**",
            str(sevs.get("critical", 0)),
            str(sevs.get("high", 0)),
            str(sevs.get("medium", 0)),
            str(sevs.get("low", 0)),
            str(eco_total),
        ])
    rows.append([
        "**Total**",
        str(summary["critical"]),
        str(summary["high"]),
        str(summary["medium"]),
        str(summary["low"]),
        str(total),
    ])
    w.table(
        ["Ecosystem", "Critical", "High", "Medium", "Low", "Total"],
        rows,
        ["left", "center", "center", "center", "center", "center"],
    )
    w.tab_end()

    # Per-ecosystem advisory tabs
    for eco_name, label in [
        ("npm", "npm"), ("cargo", "Cargo"), ("python", "Python"),
    ]:
        eco = ecosystems.get(eco_name, {})
        w.tab_start(label)
        items = eco.get("advisories", [])
        if not items:
            w.admonition(
                "tip", "All Clear",
                f"No {label.lower()} advisories found.",
            )
        else:
            adv_rows = []
            for item in sorted(
                items,
                key=lambda x: SEVERITY_ORDER.index(
                    x.get("severity", "medium")),
            ):
                sev = item.get("severity", "medium").capitalize()
                pkg = item.get("package", "")
                title = item.get("title", item.get("id", ""))
                if len(title) > 60:
                    title = title[:57] + "..."
                title = escape_mdx(title)
                url = item.get("url", "")
                link = f"[Details]({url})" if url else ""
                adv_rows.append([sev, f"`{pkg}`", title, link])
            w.table(
                ["Severity", "Package", "Advisory", "Link"],
                adv_rows,
            )
        w.tab_end()

    # CodeQL tab
    eco = ecosystems.get("codeql", {})
    w.tab_start("CodeQL")
    alerts = eco.get("alerts", [])
    if not alerts:
        w.admonition("tip", "All Clear", "No open CodeQL alerts.")
    else:
        cq_rows = []
        for alert in sorted(
            alerts,
            key=lambda x: SEVERITY_ORDER.index(
                x.get("severity", "medium")),
        ):
            sev = alert.get("severity", "medium").capitalize()
            rule = alert.get("rule_id", "")
            apath = alert.get("path", "")
            if len(apath) > 50:
                apath = "..." + apath[-47:]
            url = alert.get("url", "")
            link = f"[Details]({url})" if url else ""
            cq_rows.append([sev, f"`{rule}`", f"`{apath}`", link])
        w.table(
            ["Severity", "Rule", "Path", "Link"], cq_rows,
        )
    w.tab_end()

    # Dependabot tab
    eco = ecosystems.get("dependabot", {})
    w.tab_start("Dependabot")
    alerts = eco.get("alerts", [])
    if not alerts:
        w.admonition(
            "tip", "All Clear", "No open Dependabot alerts.",
        )
    else:
        db_rows = []
        for alert in sorted(
            alerts,
            key=lambda x: SEVERITY_ORDER.index(
                x.get("severity", "medium")),
        ):
            sev = alert.get("severity", "medium").capitalize()
            pkg = alert.get("package", "")
            aeco = alert.get("ecosystem", "")
            asummary = alert.get("summary", "")
            if len(asummary) > 50:
                asummary = asummary[:47] + "..."
            url = alert.get("url", "")
            link = f"[Details]({url})" if url else ""
            db_rows.append(
                [sev, f"`{pkg}`", aeco, asummary, link])
        w.table(
            ["Severity", "Package", "Ecosystem", "Summary", "Link"],
            db_rows,
        )
    w.tab_end()

    w.tabs_end()

    w.text("---")
    w.text(
        "*Auto-generated by "
        "[ci-dashboard.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-dashboard.yml)*"
    )

    w.write_to(path)
    click.echo(f"MDX written to {path} ({total} total findings)")
