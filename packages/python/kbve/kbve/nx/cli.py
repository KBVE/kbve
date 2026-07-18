"""Command-line entry points for Nx dashboard generation.

``kbve-nx-security`` aggregates a raw multi-ecosystem audit payload into
MDX and/or JSON. ``kbve-nx-graph`` renders an Nx project graph into MDX.
Both mirror the standalone ``scripts/nx-*-to-mdx.py`` interfaces so the
``ci-dashboard`` workflow can migrate without arg changes.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error

from datetime import date

from .alerts import ENDPOINTS, fetch_all, validate
from .builder import Builder
from .graph import parse_graph
from .render import render_graph_mdx, render_security_json, render_security_mdx
from .security import parse_all_ecosystems


def security_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="kbve-nx-security",
        description="Aggregate security audit data into MDX and JSON.",
    )
    parser.add_argument(
        "--input", required=True,
        help="Path to aggregated raw security JSON")
    parser.add_argument(
        "--mdx-out", help="Path to write Starlight MDX output")
    parser.add_argument(
        "--json-out", help="Path to write structured JSON output")
    parser.add_argument(
        "--timestamp", required=True,
        help="ISO 8601 timestamp for the report")
    args = parser.parse_args(argv)

    if not args.mdx_out and not args.json_out:
        print("Error: at least one of --mdx-out or --json-out required",
              file=sys.stderr)
        return 1

    with open(args.input) as f:
        raw = json.load(f)

    parsed = parse_all_ecosystems(raw)
    data = {
        "generated_at": args.timestamp,
        "summary": parsed["summary"],
        "ecosystems": parsed["ecosystems"],
    }
    total = sum(data["summary"].values())

    if args.json_out:
        with open(args.json_out, "w") as f:
            f.write(render_security_json(data))
        print(f"JSON written to {args.json_out} ({total} total findings)")
    if args.mdx_out:
        with open(args.mdx_out, "w") as f:
            f.write(render_security_mdx(data, args.timestamp))
        print(f"MDX written to {args.mdx_out} ({total} total findings)")

    return 0


def graph_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="kbve-nx-graph",
        description="Render an Nx project graph into Starlight MDX.",
    )
    parser.add_argument("graph", help="Path to nx graph JSON")
    parser.add_argument("output", help="Path to write MDX output")
    parser.add_argument("timestamp", help="ISO 8601 timestamp for the report")
    args = parser.parse_args(argv)

    graph = parse_graph(args.graph)
    with open(args.output, "w") as f:
        f.write(render_graph_mdx(graph, args.timestamp))

    print(
        f"Generated {args.output}"
        f" — {len(graph.nodes)} projects, {len(graph.edges)} edges"
    )
    return 0


def alerts_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="kbve-nx-alerts",
        description="Fetch open GitHub security alerts for KBVE/kbve.",
    )
    parser.add_argument(
        "--endpoint", required=True, choices=sorted(ENDPOINTS),
        help="Which security feed to fetch.")
    parser.add_argument(
        "--out", required=True,
        help="Where to write the filtered JSON array.")
    parser.add_argument(
        "--per-page", type=int, default=100,
        help="Pagination size (max 100 per GitHub).")
    parser.add_argument(
        "--timeout", type=float, default=30.0,
        help="Per-request timeout in seconds.")
    args = parser.parse_args(argv)

    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        print("::error::GITHUB_TOKEN env not set", file=sys.stderr)
        with open(args.out, "w") as f:
            json.dump([], f)
        return 2

    path = ENDPOINTS[args.endpoint]
    try:
        raw = fetch_all(path, token, args.per_page, args.timeout)
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            print(
                "::notice::"
                f"{args.endpoint} returned HTTP {e.code}"
                " — assuming zero alerts",
                file=sys.stderr)
            with open(args.out, "w") as f:
                json.dump([], f)
            return 0
        print("::error::"
              f"{args.endpoint} HTTP {e.code}: {e.reason}",
              file=sys.stderr)
        with open(args.out, "w") as f:
            json.dump([], f)
        return 2
    except (urllib.error.URLError, ValueError, json.JSONDecodeError) as e:
        print("::warning::"
              f"{args.endpoint} fetch failed: {e}",
              file=sys.stderr)
        with open(args.out, "w") as f:
            json.dump([], f)
        return 2

    clean = validate(raw)
    with open(args.out, "w") as f:
        json.dump(clean, f, indent=2)
    print(f"{args.endpoint}: {len(clean)} open alerts")
    return 0


def router_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="kbve-nx-router",
        description="Emit the routes needing work as a GH Actions matrix.",
    )
    parser.add_argument("--cadence", default="daily",
                        help="Route cadence to select (default: daily).")
    parser.add_argument("--json", action="store_true",
                        help="Print the matrix JSON (default behavior).")
    parser.add_argument("--content-root",
                        help="Override the docs content root.")
    args = parser.parse_args(argv)

    builder = Builder(content_root=args.content_root)
    results = builder.plan_all(args.cadence)
    matrix = {"include": [{"route": r.route} for r in results if r.needs_work]}

    print(json.dumps(matrix))

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        has_work = "true" if matrix["include"] else "false"
        with open(out, "a") as f:
            f.write("matrix=%s\n" % json.dumps(matrix, separators=(",", ":")))
            f.write("has_work=%s\n" % has_work)
    return 0


def build_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="kbve-nx-build",
        description="Run a single content route and report changed files.",
    )
    parser.add_argument("route", help="Route name to build.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Compute edits without writing.")
    parser.add_argument("--date", help="Target date as MM-DD.")
    parser.add_argument("--year", help="Target 4-digit year.")
    parser.add_argument("--content-root",
                        help="Override the docs content root.")
    args = parser.parse_args(argv)

    target = None
    if args.date:
        try:
            month, day = (int(x) for x in args.date.split("-"))
            year = int(args.year) if args.year else date.today().year
            target = date(year, month, day)
        except (ValueError, TypeError) as e:
            print("Error: invalid --date/--year: %s" % e, file=sys.stderr)
            return 2

    builder = Builder(
        content_root=args.content_root, date=target, dry_run=args.dry_run
    )
    try:
        result = builder.build_one(args.route)
    except KeyError as e:
        print("Error: %s" % e, file=sys.stderr)
        return 2

    for path in result.changed:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(security_main())
