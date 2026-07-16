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

from .alerts import ENDPOINTS, fetch_all, validate
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


if __name__ == "__main__":
    raise SystemExit(security_main())
