"""Human summary of an SEO audit run.

    uv run --extra osrs kbve-seo-report [--root <repo>] [--only <collection>]
                                        [--rule <rule-id>]

Prints per-collection health and the worst offenders. Read-only.
"""
import argparse
import sys
from collections import Counter

from kbve.seo._pages import find_content_dir
from kbve.seo.audit import audit


def main():
    parser = argparse.ArgumentParser(description="Summarize astro-kbve SEO audit.")
    parser.add_argument("--root", default=None, help="Repo root path")
    parser.add_argument("--only", default=None, help="Restrict to one collection")
    parser.add_argument("--rule", default=None, help="List pages hitting this rule")
    args = parser.parse_args()

    content_dir = find_content_dir(args.root)
    result = audit(content_dir, only=args.only)
    s = result["summary"]

    print("== SEO audit ==")
    print("pages %d | error %d | warn %d | info %d\n"
          % (s["pages"], s["error"], s["warn"], s["info"]))

    print("per collection:")
    for name, c in sorted(s["collections"].items(),
                          key=lambda kv: -(kv[1]["error"] + kv[1]["warn"])):
        print("  %-14s pages %-4d error %-3d warn %-3d info %-3d"
              % (name, c["pages"], c["error"], c["warn"], c["info"]))

    rule_counts = Counter()
    for page in result["pages"].values():
        for f in page["audit"]["findings"]:
            rule_counts[f["rule"]] += 1
    print("\nby rule:")
    for rule, n in rule_counts.most_common():
        print("  %-18s %d" % (rule, n))

    if args.rule:
        print("\npages hitting %s:" % args.rule)
        for url, page in sorted(result["pages"].items()):
            hits = [f for f in page["audit"]["findings"] if f["rule"] == args.rule]
            for f in hits:
                print("  %-40s %s" % (url, f["message"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
