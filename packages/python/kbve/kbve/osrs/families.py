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
import os
import re
from collections import defaultdict

import yaml

from kbve.osrs._corpus import find_content_dir, iter_items

SITE = "https://kbve.com"

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


def _indent_yaml(block, indent="  "):
    dumped = yaml.dump(block, default_flow_style=False, sort_keys=False,
                       allow_unicode=True).rstrip("\n")
    return "\n".join(indent + ln for ln in dumped.split("\n"))


def write_families(content_dir, result, min_members):
    """Stamp family_ref (+ canonical / family roster) into each member MDX."""
    fam_by_key = {f["family_name"].lower(): f for f in result["families"]}
    stamped = 0
    skipped_existing = 0
    dose_pages_needed = []
    for fname, osrs, raw in iter_items(content_dir):
        name = str(osrs.get("name", "")).strip()
        if not name:
            continue
        base, role, dose = family_of(name)
        fam = fam_by_key.get(base.lower())
        if not fam:
            continue
        m = re.match(r"^---\n(.*?)\n---", raw, re.S)
        if not m or re.search(r"^\s+family_ref:\s*$", m.group(1), re.M):
            skipped_existing += 1
            continue
        item_id = osrs.get("id")
        is_canonical = (
            fam["canonical_id"] is not None and item_id == fam["canonical_id"]
        )
        family_url = "%s/osrs/%s/" % (SITE, fam["family_slug"])
        ref = {"family_slug": fam["family_slug"], "role": role}
        if dose is not None:
            ref["dose"] = dose
        block = {"family_ref": ref}
        if is_canonical:
            roster = [
                {
                    "id": mem["id"],
                    "slug": mem["slug"],
                    "name": mem["name"],
                    "icon": mem.get("icon"),
                    "role": mem["kind"],
                    "dose": mem.get("dose"),
                    "value": mem.get("value"),
                    "lowalch": mem.get("lowalch"),
                    "highalch": mem.get("highalch"),
                }
                for mem in fam["members"]
            ]
            block["family"] = {
                "slug": fam["family_slug"],
                "name": fam["family_name"],
                "type": fam["type"],
                "canonical_id": fam["canonical_id"],
                "members": roster,
            }
        else:
            block["canonical"] = family_url
        mv = re.search(r"\n(\s*)mdx_version:", raw)
        if not mv:
            continue
        indent = mv.group(1)
        snippet = "\n" + _indent_yaml(block, indent)
        raw2 = raw[:mv.start()] + snippet + raw[mv.start():]
        with open(os.path.join(content_dir, fname), "w", encoding="utf-8") as fh:
            fh.write(raw2)
        stamped += 1
        if not fam["has_base_item"]:
            dose_pages_needed.append(fam["family_slug"])
    return {
        "stamped": stamped,
        "skipped_existing": skipped_existing,
        "dose_family_pages_needed": sorted(set(dose_pages_needed)),
    }


def redirect_pairs(result, base_only=True):
    """(source_url, family_url) pairs for HTTP 301s, both slash variants.

    Restricted to families whose canonical page already exists (has_base_item)
    when base_only=True, so we never 301 to a not-yet-built dose-family page.
    """
    pairs = []
    seen = set()
    for fam in result["families"]:
        if base_only and not fam["has_base_item"]:
            continue
        target = "/osrs/%s/" % fam["family_slug"]
        for m in fam["members"]:
            slug = m["slug"]
            if slug == fam["family_slug"] or slug in seen:
                continue
            seen.add(slug)
            pairs.append(("/osrs/%s" % slug, target))
            pairs.append(("/osrs/%s/" % slug, target))
    return pairs


def render_rust(pairs):
    lines = [
        "// @generated by kbve-osrs-families --rust-out. DO NOT EDIT.",
        "// Regenerate: uv run --extra osrs kbve-osrs-families "
        "--root <repo> --rust-out <path>",
        "//! OSRS item-family 301 redirects (member page -> canonical family page).",
        "",
        "/// Member-page URLs that permanently redirect to their family page.",
        "pub static OSRS_FAMILY_REDIRECTS: &[(&str, &str)] = &[",
    ]
    for src, dst in pairs:
        lines.append('    ("%s", "%s"),' % (src, dst))
    lines.append("];")
    lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Resolve OSRS item families.")
    parser.add_argument("--root", default=None, help="Repo root path")
    parser.add_argument("--json", default=None, help="Write JSON to this path")
    parser.add_argument("--min-members", type=int, default=2,
                        help="Minimum members for a family (default 2)")
    parser.add_argument("--write", action="store_true",
                        help="Stamp family_ref/canonical/roster into member MDX")
    parser.add_argument("--only", default=None,
                        help="Restrict --write to one family slug (pilot)")
    parser.add_argument("--rust-out", default=None,
                        help="Write the axum 301 redirect table (.rs) to this path")
    args = parser.parse_args()

    content_dir = find_content_dir(args.root)
    result = resolve(content_dir, args.min_members)
    if args.only:
        result["families"] = [
            f for f in result["families"] if f["family_slug"] == args.only
        ]
    text = json.dumps(result, indent=2)
    if args.json and not args.write:
        with open(args.json, "w", encoding="utf-8") as fh:
            fh.write(text)
    if args.rust_out:
        pairs = redirect_pairs(result, base_only=True)
        with open(args.rust_out, "w", encoding="utf-8") as fh:
            fh.write(render_rust(pairs))
        print("wrote %d redirect routes (%d families) -> %s" % (
            len(pairs), result["family_count"], args.rust_out))
        return
    if args.write:
        w = write_families(content_dir, result, args.min_members)
        print("stamped: %d  skipped(existing): %d" % (
            w["stamped"], w["skipped_existing"]))
        if w["dose_family_pages_needed"]:
            print("dose families needing a new page: %d" % (
                len(w["dose_family_pages_needed"])))
        return
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
