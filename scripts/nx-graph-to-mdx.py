#!/usr/bin/env python3
"""Parse an NX graph JSON file into a Starlight MDX page.

Usage: nx-graph-to-mdx.py <graph.json> <output.mdx> <timestamp>
"""
import json
import re
import sys


def mermaid_id(name: str) -> str:
    """Sanitize a project name into a valid mermaid node ID."""
    return re.sub(r"[^a-zA-Z0-9_]", "_", name)


# Mermaid style classes per project type
TYPE_STYLES = {
    "app": (":::app", "fill:#3b82f6,stroke:#1d4ed8,color:#fff"),
    "lib": (":::lib", "fill:#10b981,stroke:#059669,color:#fff"),
    "e2e": (":::e2e", "fill:#f59e0b,stroke:#d97706,color:#fff"),
}

# Starlight Card icons per project type
TYPE_ICONS = {
    "app": "rocket",
    "lib": "puzzle",
    "e2e": "approve-check-circle",
}


def main():
    if len(sys.argv) != 4:
        print(
            f"Usage: {sys.argv[0]} <graph.json> <output.mdx> <timestamp>",
            file=sys.stderr,
        )
        sys.exit(1)

    graph_path, output_path, timestamp = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(graph_path) as f:
        data = json.load(f)

    nodes = data["graph"]["nodes"]
    deps = data["graph"]["dependencies"]

    # Group projects by type
    by_type: dict[str, list[str]] = {}
    for name, node in sorted(nodes.items()):
        ptype = node.get("type", "unknown")
        by_type.setdefault(ptype, []).append(name)

    # Build project rows with stats
    rows = []
    for name in sorted(nodes):
        node = nodes[name]
        ptype = node.get("type", "unknown")
        root = node.get("data", {}).get("root", "")
        dep_count = len(deps.get(name, []))
        dependents = sum(
            1 for d_list in deps.values() for d in d_list if d["target"] == name
        )
        rows.append((name, ptype, root, dep_count, dependents))

    # Find most-connected projects (top hubs)
    top_depended = sorted(rows, key=lambda r: r[4], reverse=True)[:5]

    # Collect unique edges for mermaid
    seen_edges: set[tuple[str, str]] = set()
    edges_by_source: dict[str, list[str]] = {}
    for dep_list in deps.values():
        for d in dep_list:
            edge = (d["source"], d["target"])
            if edge not in seen_edges:
                seen_edges.add(edge)
                edges_by_source.setdefault(d["source"], []).append(d["target"])

    with open(output_path, "w") as out:
        # Frontmatter
        out.write(
            "---\n"
            "title: NX Dependency Graph\n"
            "description: |\n"
            "    Weekly auto-generated NX project dependency graph"
            " for the KBVE monorepo.\n"
            "sidebar:\n"
            "    label: NX Graph\n"
            "    order: 101\n"
            "editUrl: false\n"
            "---\n\n"
        )

        # Import Starlight components
        out.write(
            "import { Card, CardGrid, Tabs, TabItem }"
            " from '@astrojs/starlight/components';\n\n"
        )

        # Header
        out.write("## NX Dependency Graph\n\n")
        out.write(
            ":::note[Auto-generated]\n"
            f"Last generated: **{timestamp}** — "
            "updated every Tuesday by `ci-weekly-nx-report`.\n"
            ":::\n\n"
        )

        # Overview cards
        out.write("<CardGrid>\n")
        for ptype in sorted(by_type):
            icon = TYPE_ICONS.get(ptype, "document")
            count = len(by_type[ptype])
            label = ptype.capitalize() + ("s" if count != 1 else "")
            out.write(
                f'  <Card title="{count} {label}" icon="{icon}">\n'
            )
            names = ", ".join(sorted(by_type[ptype])[:6])
            if len(by_type[ptype]) > 6:
                names += f" + {len(by_type[ptype]) - 6} more"
            out.write(f"    {names}\n")
            out.write("  </Card>\n")
        # Total stats card
        out.write(
            f'  <Card title="{len(seen_edges)} Dependencies" icon="random">\n'
            f"    Across {len(nodes)} projects in the monorepo.\n"
            "  </Card>\n"
        )
        out.write("</CardGrid>\n\n")

        # Top hubs callout
        out.write("### Most Depended-On Projects\n\n")
        out.write("<CardGrid>\n")
        for name, ptype, root, dc, dependents in top_depended:
            if dependents == 0:
                continue
            icon = TYPE_ICONS.get(ptype, "document")
            out.write(
                f'  <Card title="{name}" icon="{icon}">\n'
                f"    **{dependents}** project"
                f"{'s' if dependents != 1 else ''}"
                f" depend on this {ptype}."
                f" Located at `{root}`.\n"
                "  </Card>\n"
            )
        out.write("</CardGrid>\n\n")

        # Tabbed content: diagram + tables
        out.write("<Tabs>\n")
        out.write("  <TabItem label=\"Diagram\">\n\n")

        # Mermaid diagram with styled nodes
        if len(seen_edges) <= 200:
            mermaid_lines = ["graph LR"]
            # Add classDef styles
            for ptype, (_, style) in TYPE_STYLES.items():
                mermaid_lines.append(f"    classDef {ptype} {style}")
            # Add edges
            for src, targets in sorted(edges_by_source.items()):
                src_id = mermaid_id(src)
                for tgt in sorted(targets):
                    tgt_id = mermaid_id(tgt)
                    mermaid_lines.append(
                        f"    {src_id}[\"{src}\"]"
                        f" --> {tgt_id}[\"{tgt}\"]"
                    )
            # Apply classes to nodes
            for ptype, node_names in by_type.items():
                if ptype in TYPE_STYLES:
                    ids = ",".join(mermaid_id(n) for n in node_names)
                    mermaid_lines.append(f"    class {ids} {ptype}")

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
        out.write("  <TabItem label=\"Project Index\">\n\n")

        # Project index table
        out.write(
            "| Project | Type | Root | Deps | Dependents |\n"
            "|---------|------|------|:----:|:----------:|\n"
        )
        for name, ptype, root, dep_count, dependents in rows:
            out.write(
                f"| **{name}** | {ptype} | `{root}` "
                f"| {dep_count} | {dependents} |\n"
            )
        out.write("\n")

        out.write("  </TabItem>\n")
        out.write("  <TabItem label=\"Details\">\n\n")

        # Per-project dependency details grouped by type
        for ptype in sorted(by_type):
            type_projects = [
                n for n in sorted(by_type[ptype])
                if deps.get(n)
            ]
            if not type_projects:
                continue
            out.write(
                f"#### {ptype.capitalize()} Projects\n\n"
            )
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
                    out.write(
                        f"| {d['target']} | {d['type']} |\n"
                    )
                out.write("\n</details>\n\n")

        out.write("  </TabItem>\n")
        out.write("</Tabs>\n\n")

        out.write("---\n\n")
        out.write(
            "*Auto-generated by "
            "[ci-weekly-nx-report.yml]"
            "(https://github.com/KBVE/kbve/actions/"
            "workflows/ci-weekly-nx-report.yml)*\n"
        )

    print(
        f"Generated {output_path}"
        f" — {len(nodes)} projects, {len(seen_edges)} edges"
    )


if __name__ == "__main__":
    main()
