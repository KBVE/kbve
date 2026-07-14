"""Survey the OSRS item corpus: tiers, section fill, variant counts.

    uv run kbve-osrs-survey --root <repo> [--json out.json]
"""
import argparse
import json
from collections import Counter

from kbve.osrs._corpus import (
    RICH_SECTIONS,
    classify_variant,
    find_content_dir,
    iter_items,
    tier_for,
)


def _dist(vals):
    vals = sorted(vals)
    n = len(vals)

    def pct(p):
        return vals[min(n - 1, int(p * n))]

    return {
        "min": vals[0], "p25": pct(.25), "median": pct(.5),
        "p75": pct(.75), "p90": pct(.9), "max": vals[-1],
    }


def survey(content_dir):
    section_counts = Counter()
    tier_counts = Counter()
    variant_counts = Counter()
    version_counts = Counter()
    members = Counter()
    line_counts = []
    about_lens = []
    nonvariant = 0

    for _fname, osrs, raw in iter_items(content_dir):
        line_counts.append(raw.count("\n") + 1)
        version_counts[osrs.get("mdx_version", "none")] += 1
        members[bool(osrs.get("members"))] += 1
        tier, present, abl = tier_for(osrs)
        tier_counts[tier] += 1
        about_lens.append(abl)
        for s in RICH_SECTIONS:
            if s in osrs and osrs[s]:
                section_counts[s] += 1
        kind = classify_variant(str(osrs.get("name", "")))
        if kind:
            variant_counts[kind] += 1
        else:
            nonvariant += 1

    return {
        "total_files": sum(version_counts.values()),
        "mdx_version": dict(version_counts),
        "members": {str(k): v for k, v in members.items()},
        "line_dist": _dist(line_counts),
        "about_char_dist": _dist(about_lens),
        "about_under_200_chars": sum(1 for x in about_lens if x < 200),
        "tier": dict(tier_counts),
        "section_fill": dict(section_counts.most_common()),
        "variant_total": sum(variant_counts.values()),
        "variant_class": dict(variant_counts.most_common()),
        "nonvariant": nonvariant,
    }


def main():
    parser = argparse.ArgumentParser(description="Survey the OSRS item corpus.")
    parser.add_argument("--root", default=None, help="Repo root path")
    parser.add_argument("--json", default=None, help="Write JSON to this path")
    args = parser.parse_args()

    result = survey(find_content_dir(args.root))
    text = json.dumps(result, indent=2)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            fh.write(text)
    print(text)


if __name__ == "__main__":
    main()
