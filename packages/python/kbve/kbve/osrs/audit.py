"""Audit thin OSRS items: full STUB list and sparse BASIC ranking.

    uv run kbve-osrs-audit --root <repo> [--json out.json]
"""
import argparse
import json
from collections import Counter

from kbve.osrs._corpus import (
    classify_variant,
    find_content_dir,
    iter_items,
    tier_for,
)


def audit(content_dir):
    stubs = []
    basics = []
    for fname, osrs, _raw in iter_items(content_dir):
        tier, present, abl = tier_for(osrs)
        if tier == "RICH":
            continue
        rec = {
            "slug": str(osrs.get("slug", fname[:-4])),
            "name": str(osrs.get("name", "")),
            "members": bool(osrs.get("members")),
            "variant": classify_variant(str(osrs.get("name", ""))),
            "about_len": abl,
            "nsections": len(present),
            "sections": present,
        }
        if tier == "STUB":
            stubs.append(rec)
        else:
            basics.append(rec)

    basics.sort(key=lambda r: (r["nsections"], r["about_len"]))
    stubs.sort(key=lambda r: (r["variant"] or "zz", r["slug"]))

    return {
        "stub_count": len(stubs),
        "basic_count": len(basics),
        "stub_variant_breakdown": dict(Counter(s["variant"] for s in stubs)),
        "basic_variant_breakdown": dict(Counter(b["variant"] for b in basics)),
        "stubs": stubs,
        "basics": basics,
    }


def main():
    parser = argparse.ArgumentParser(description="Audit thin OSRS items.")
    parser.add_argument("--root", default=None, help="Repo root path")
    parser.add_argument("--json", default=None, help="Write JSON to this path")
    args = parser.parse_args()

    result = audit(find_content_dir(args.root))
    text = json.dumps(result, indent=2)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            fh.write(text)
    print("STUB: %d  BASIC: %d" % (result["stub_count"], result["basic_count"]))
    print("stub variants:", result["stub_variant_breakdown"])
    print("basic variants:", result["basic_variant_breakdown"])


if __name__ == "__main__":
    main()
