"""Render a parsed project graph into the dependency-graph page."""

from __future__ import annotations


from ...svg import DagEdge, DagNode, Slice, dag_svg, donut_svg
from ._shared import (
    TYPE_LABELS,
    TYPE_SVG,
    _MAX_DIAGRAM_NODES,
    _linkcard,
    _stat_tile,
)
from ..graph import GraphData, top_hubs


def render_graph_mdx(graph: GraphData, timestamp: str) -> str:
    """Render the Bento-native MDX project dependency-graph page."""
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
        "title: Dependency Graph\n"
        "description: |\n"
        "    Daily auto-generated moon project dependency graph"
        " for the KBVE monorepo.\n"
        "template: splash\n"
        "tableOfContents: false\n"
        "editUrl: false\n"
        "lastUpdated: false\n"
        "next: false\n"
        "prev: false\n"
        "sidebar:\n"
        "    label: Graph\n"
        "    order: 101\n"
        "---\n\n"
    )
    out.write(
        "import BentoShell from '@/components/hero/BentoShell.astro';\n"
        "import BentoProse from '@/components/hero/BentoProse.astro';\n\n"
    )

    lede = (
        f"<strong>{len(nodes)}</strong> projects wired by"
        f" <strong>{len(seen_edges)}</strong> dependency"
        f" edge{'s' if len(seen_edges) != 1 else ''}."
    )

    out.write('<div class="graph-report" data-dash-report>\n\n')

    out.write(
        '<section class="bento-hero bento-section not-content"'
        ' aria-label="Project dependency graph">\n'
        '\t<div class="bento-hero__bg" aria-hidden="true"></div>\n'
        '\t<div class="bento-hero__frame bento-frame">\n'
        '\t\t<div class="bento-board bento-board--hero">\n'
        '\t\t\t<div class="bento-cell bento-hero-copy bento-card'
        ' bento-card--glass">\n'
        '\t\t\t\t<span class="bento-badge bento-chip">\n'
        '\t\t\t\t\t<svg viewBox="0 0 24 24" width="14" height="14"'
        ' fill="none" stroke="currentColor" stroke-width="1.75"'
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        '<path d="M6 3v12M18 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 21a3 3 0 1 0'
        ' 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9" /></svg>\n'
        "\t\t\t\t\t<span>auto-generated · daily</span>\n"
        "\t\t\t\t</span>\n"
        '\t\t\t\t<h1 class="bento-title">\n'
        "\t\t\t\t\tDependency graph\n"
        '\t\t\t\t\t<span class="bento-title__accent">across the'
        " monorepo.</span>\n"
        "\t\t\t\t</h1>\n"
        f'\t\t\t\t<p class="bento-lede">{lede}</p>\n'
        f'\t\t\t\t<p class="bento-lede">Last generated'
        f" <strong>{timestamp}</strong>.</p>\n"
        '\t\t\t\t<div class="bento-cta">\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--primary" href="#diagram">\n'
        "\t\t\t\t\t\tView diagram\n"
        '\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none"'
        ' stroke="currentColor" aria-hidden="true"><path'
        ' stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
        ' d="M5 12h14M13 6l6 6-6 6" /></svg>\n'
        "\t\t\t\t\t</a>\n"
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#hubs">Top hubs</a>\n'
        '\t\t\t\t\t<a class="bento-btn bento-btn--ghost"'
        ' href="#project-index">Projects</a>\n'
        "\t\t\t\t</div>\n"
        "\t\t\t</div>\n\n"
    )

    _stat_tile(out, TYPE_SVG["application"], len(by_type.get("application", set())), "Applications")
    _stat_tile(out, TYPE_SVG["library"], len(by_type.get("library", set())), "Libraries")
    _stat_tile(out, TYPE_SVG["tool"], len(by_type.get("tool", set())), "Tools")
    _stat_tile(out, TYPE_SVG["automation"], len(by_type.get("automation", set())), "Automation")
    _stat_tile(out, TYPE_SVG["deps"], len(seen_edges), "Dependencies")

    out.write(
        "\t\t</div>\n"
        '\t\t<nav class="bento-jump" aria-label="On this page">\n'
        '\t\t\t<a class="bento-chip" href="#hubs">Hubs</a>\n'
        '\t\t\t<a class="bento-chip" href="#diagram">Diagram</a>\n'
        '\t\t\t<a class="bento-chip" href="#project-index">Projects</a>\n'
        "\t\t</nav>\n"
        "\t</div>\n"
        "</section>\n\n"
    )

    out.write(
        '<BentoShell id="hubs" eyebrow="Connectivity"'
        ' heading="Most depended-on">\n'
        '\t<div class="bento-board bento-board--cols-3">\n'
    )
    any_hub = False
    for row in top_depended:
        if row.dependent_count == 0:
            continue
        any_hub = True
        path = TYPE_SVG.get(row.project_type, TYPE_SVG["deps"])
        copy = (
            f"{row.dependent_count} project"
            f"{'s' if row.dependent_count != 1 else ''} depend on this"
            f" {row.project_type} · {row.root}"
        )
        _linkcard(out, path, row.name, copy)
    if not any_hub:
        _linkcard(
            out,
            TYPE_SVG["deps"],
            "No hubs",
            "No project is depended on by another yet.",
        )
    out.write("\t</div>\n</BentoShell>\n\n")

    out.write('<BentoProse id="diagram" heading="Dependency diagram">\n\n')

    out.write("### Project distribution\n\n")
    distribution = donut_svg(
        "Projects by Type",
        [Slice(TYPE_LABELS.get(ptype, ptype.capitalize()), len(by_type[ptype])) for ptype in sorted(by_type)],
    )
    if distribution:
        out.write(f'<div class="kbve-figure">{distribution}</div>\n\n')

    if top_depended and top_depended[0].dependent_count > 0:
        out.write("### Hub connectivity\n\n")
        hubs = donut_svg(
            "Dependents per Hub",
            [Slice(row.name, row.dependent_count) for row in top_depended if row.dependent_count > 0],
        )
        if hubs:
            out.write(f'<div class="kbve-figure">{hubs}</div>\n\n')

    out.write("### Graph\n\n")
    if len(nodes) <= _MAX_DIAGRAM_NODES:
        diagram_nodes = set(nodes)
        capped = False
    else:
        ranked = sorted(
            rows,
            key=lambda r: (r.dep_count + r.dependent_count, r.dependent_count, r.name),
            reverse=True,
        )
        diagram_nodes = {r.name for r in ranked[:_MAX_DIAGRAM_NODES]}
        capped = True

    if capped:
        out.write(
            ":::note\n"
            f"Showing the <strong>{_MAX_DIAGRAM_NODES}</strong> most-connected"
            f" projects of <strong>{len(nodes)}</strong> — the rest would not"
            " stay readable inline. Every project is listed in the"
            " [Project index](#project-index) below, and"
            " [Graph Explorer](/dashboard/graph-explorer/) walks the whole"
            " monorepo interactively.\n"
            ":::\n\n"
        )

    diagram_edges = [
        DagEdge(src, tgt)
        for src, targets in sorted(edges_by_source.items())
        if src in diagram_nodes
        for tgt in sorted(targets)
        if tgt in diagram_nodes
    ]
    diagram = dag_svg(
        [DagNode(name, nodes[name].get("type", "unknown")) for name in sorted(diagram_nodes)],
        diagram_edges,
        title="Project dependency graph",
    )

    if diagram:
        out.write(f'<div class="kbve-figure kbve-figure--wide">{diagram}</div>\n\n')
        out.write(
            ":::tip[Legend]\n"
            "**Blue** = Application &nbsp; "
            "**Green** = Library &nbsp; "
            "**Amber** = E2E Test &nbsp; "
            "Arrows point from a project to what it depends on; dashed arrows"
            " close a dependency cycle.\n"
            ":::\n\n"
        )
    else:
        out.write(":::caution\nNo dependency edges among the top projects to diagram.\n:::\n\n")

    out.write("</BentoProse>\n\n")

    out.write('<BentoProse id="project-index" heading="Project index">\n\n')
    out.write("| Project | Type | Root | Deps | Dependents |\n|---------|------|------|:----:|:----------:|\n")
    for row in rows:
        out.write(f"| **{row.name}** | {row.project_type} | `{row.root}` | {row.dep_count} | {row.dependent_count} |\n")
    out.write("\n")

    for ptype in sorted(by_type):
        type_projects = [n for n in sorted(by_type[ptype]) if deps.get(n)]
        if not type_projects:
            continue
        out.write(f"#### {TYPE_LABELS.get(ptype, ptype.capitalize())}\n\n")
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

    out.write("</BentoProse>\n\n")

    out.write('<BentoProse id="about">\n\n')
    out.write("---\n\n")
    out.write(
        "*Auto-generated by "
        "[ci-daily-content.yml]"
        "(https://github.com/KBVE/kbve/actions/"
        "workflows/ci-daily-content.yml)*\n\n"
    )
    out.write("</BentoProse>\n\n")

    out.write("</div>\n\n")
    out.write(
        "<style is:global>{`.graph-report{--bento-accent:#a78bfa;"
        "--bento-accent-2:#38bdf8}"
        ".graph-report .kbve-figure{margin:1.5rem 0;display:flex;"
        "justify-content:center}"
        ".graph-report .kbve-figure--wide{display:block;overflow-x:auto;"
        "overscroll-behavior-x:contain}"
        ".graph-report .kbve-figure--wide svg{min-width:640px}`}</style>\n"
    )

    return out.getvalue()
