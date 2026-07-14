"""Run the SEO rule registry over the docs collections.

    uv run --extra osrs kbve-seo-audit [--root <repo>] [--only <collection>]
                                       [--json out.json]

Emits findings.json: the shared page-keyed contract other pillars enrich.
Exit status is non-zero when any error-severity finding is present, so the
same command gates CI.
"""
import argparse
import json
import sys

from kbve.seo._pages import find_content_dir, iter_pages
from kbve.seo.profiles import profile_for
from kbve.seo.rules import RULES, build_ctx


def audit(content_dir, only=None):
    pages = list(iter_pages(content_dir, only=only))
    ctx = build_ctx(pages)
    result = {"pages": {}, "summary": {}}
    counts = {"error": 0, "warn": 0, "info": 0}
    per_collection = {}
    for p in pages:
        profile = profile_for(p.collection)
        findings = []
        for rule in RULES:
            findings.extend(rule(p, ctx, profile))
        for f in findings:
            counts[f.severity] += 1
        c = per_collection.setdefault(
            p.collection, {"pages": 0, "error": 0, "warn": 0, "info": 0})
        c["pages"] += 1
        for f in findings:
            c[f.severity] += 1
        result["pages"]["/%s/%s/" % (p.collection, p.slug)] = {
            "collection": p.collection,
            "audit": {
                "findings": [f._asdict() for f in findings],
            },
            "gsc": None,
            "lhci": None,
        }
    result["summary"] = {
        "pages": len(pages),
        "collections": per_collection,
        **counts,
    }
    return result


def main():
    parser = argparse.ArgumentParser(description="Audit astro-kbve SEO metadata.")
    parser.add_argument("--root", default=None, help="Repo root path")
    parser.add_argument("--only", default=None,
                        help="Restrict to one collection (folder)")
    parser.add_argument("--json", default=None, help="Write findings to path")
    args = parser.parse_args()

    content_dir = find_content_dir(args.root)
    result = audit(content_dir, only=args.only)
    text = json.dumps(result, indent=2)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            fh.write(text)
    s = result["summary"]
    print("audited %d pages: %d error, %d warn, %d info" % (
        s["pages"], s["error"], s["warn"], s["info"]))
    return 1 if s["error"] else 0


if __name__ == "__main__":
    sys.exit(main())
