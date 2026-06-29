"""Resolve OSRS item families: cluster near-identical items for consolidation.

A *family* is a base item plus its near-identical members — poison variants
(p)/(p+)/(p++), potion doses (1)/(2)/(3)/(4), and (un)charged forms — that should
collapse onto one page. The resolver groups every item by its base name, picks a
canonical member, and emits a families.json that drives both the family pages
(array-based graphs) and the axum-kbve 301 routes.

    uv run kbve-osrs-families --root <repo> [--json out.json] [--min-members 2]
"""
import argparse
import json
import re
from collections import defaultdict

from kbve.osrs._corpus import find_content_dir, iter_items

# Suffix patterns stripped to compute the family base name. Order matters.
_POISON = re.compile(r"\s*\(p\+{0,2}\)\s*$", re.I)
_DOSE = re.compile(r"\s*\(([1-4])\)\s*$")
_CHARGE = re.compile(r"\s*\((un)?charged\)\s*$", re.I)


def _slugify(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


def family_of(name):
    """Return (base_name, member_kind, dose) for an item name."""
    n = name.strip()
    m = _DOSE.search(n)
    if m:
        return _DOSE.sub("", n).strip(), "dose", int(m.group(1))
    if _POISON.search(n):
        return _POISON.sub("", n).strip(), "poison", None
    if _CHARGE.search(n):
        return _CHARGE.sub("", n).strip(), "charged", None
    return n, "base", None


def resolve(content_dir, min_members=2):
    groups = defaultdict(list)
    for _fname, osrs, _raw in iter_items(content_dir):
        name = str(osrs.get("name", "")).strip()
        if not name:
            continue
        base, kind, dose = family_of(name)
        groups[base.lower()].append({
            "slug": str(osrs.get("slug", "")),
            "name": name,
            "id": osrs.get("id"),
            "icon": osrs.get("icon"),
            "examine": osrs.get("examine"),
            "kind": kind,
            "dose": dose,
            "value": osrs.get("value"),
            "lowalch": osrs.get("lowalch"),
            "highalch": osrs.get("highalch"),
            "members": bool(osrs.get("members")),
            "base_name": base,
        })

    families = []
    redirect_ids = {}
    slug_collisions = {}
    for key, members in sorted(groups.items()):
        if len(members) < min_members:
            continue
        members.sort(key=lambda m: (m["kind"] != "base", m["dose"] or 0, m["slug"]))
        base_name = members[0]["base_name"]
        # canonical page: the unsuffixed base member if present, else synthesized
        base_member = next((m for m in members if m["kind"] == "base"), None)
        family_slug = base_member["slug"] if base_member else _slugify(base_name)
        canonical_id = base_member["id"] if base_member else None
        kinds = sorted({m["kind"] for m in members})
        ftype = "dose" if "dose" in kinds else (
            "poison" if "poison" in kinds else "mixed")
        # flag members that share a slug (distinct ids, same slug)
        by_slug = defaultdict(list)
        for m in members:
            by_slug[m["slug"]].append(m["id"])
        for s, ids in by_slug.items():
            if len(ids) > 1:
                slug_collisions[s] = ids
        fam = {
            "family_slug": family_slug,
            "family_name": base_name,
            "type": ftype,
            "has_base_item": base_member is not None,
            "canonical_id": canonical_id,
            "members": [
                {k: m[k] for k in (
                    "slug", "name", "id", "icon", "examine", "kind", "dose",
                    "value", "lowalch", "highalch", "members")}
                for m in members
            ],
        }
        families.append(fam)
        # every member item-id except the canonical base item redirects to the
        # family page (301 target for axum-kbve, keyed by item id)
        for m in members:
            if m["id"] != canonical_id:
                redirect_ids[str(m["id"])] = family_slug

    families.sort(key=lambda f: -len(f["members"]))
    return {
        "family_count": len(families),
        "redirect_count": len(redirect_ids),
        "slug_collision_count": len(slug_collisions),
        "families": families,
        "redirect_ids": redirect_ids,
        "slug_collisions": slug_collisions,
    }


def main():
    parser = argparse.ArgumentParser(description="Resolve OSRS item families.")
    parser.add_argument("--root", default=None, help="Repo root path")
    parser.add_argument("--json", default=None, help="Write JSON to this path")
    parser.add_argument("--min-members", type=int, default=2,
                        help="Minimum members for a family (default 2)")
    args = parser.parse_args()

    result = resolve(find_content_dir(args.root), args.min_members)
    text = json.dumps(result, indent=2)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            fh.write(text)
    print("families: %d  redirects: %d" % (
        result["family_count"], result["redirect_count"]))
    print("\nlargest families:")
    for f in result["families"][:15]:
        kinds = sorted({m["kind"] for m in f["members"]})
        print("  %-28s %2d members %-18s base=%s" % (
            f["family_slug"], len(f["members"]), ",".join(kinds),
            f["has_base_item"]))


if __name__ == "__main__":
    main()
