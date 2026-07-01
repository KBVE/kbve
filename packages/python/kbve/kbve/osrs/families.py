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
import sys
from collections import defaultdict

import yaml

from kbve.osrs._corpus import find_content_dir, iter_items

SITE = "https://kbve.com"

# Suffix patterns stripped to compute the family base name. Order matters.
_POISON = re.compile(r"\s*\(p\+{0,2}\)\s*$", re.I)
_DOSE = re.compile(r"\s*\(([1-4])\)\s*$")
_CHARGE = re.compile(r"\s*\((un)?charged\)\s*$", re.I)
# Barrows-style degrade level appended with a space ("Dharok's helm 0"). Only
# real degrade tiers, so trailing numbers in normal names are not stripped.
_DEGRADE = re.compile(r"\s+(0|25|50|75|100)\s*$")


def _slugify(name):
    # Preserve the +/++ potion markers ("Anti-venom+" -> anti-venom-plus) so the
    # synthesized family slug does not collide with a distinct unsuffixed item.
    name = name.lower().replace("++", "-plus-plus").replace("+", "-plus")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name)).strip("-")


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
    if _DEGRADE.search(n):
        return _DEGRADE.sub("", n).strip(), "degraded", None
    return n, "base", None


def resolve(content_dir, min_members=2):
    groups = defaultdict(list)
    for fname, osrs, _raw in iter_items(content_dir):
        name = str(osrs.get("name", "")).strip()
        if not name:
            continue
        base, kind, dose = family_of(name)
        # The page URL is derived from the FILENAME, not the frontmatter
        # osrs.slug (which collides across poison variants). Use the filename.
        groups[base.lower()].append({
            "slug": fname[:-4] if fname.endswith(".mdx") else fname,
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
            "poison" if "poison" in kinds else (
                "degraded" if "degraded" in kinds else "mixed"))
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


# Strip previously-stamped family blocks (2-space top-level keys + their nested
# lines) so --write is idempotent / re-runnable.
_STRIP_FAMILY = re.compile(
    r"\n  (?:family_ref|family|canonical):.*?(?=\n  \S|\n---)", re.S)


def _strip_family_blocks(raw):
    return _STRIP_FAMILY.sub("", raw)


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
        raw = _strip_family_blocks(raw)  # idempotent: drop any prior stamp
        item_id = osrs.get("id")
        is_canonical = (
            fam["canonical_id"] is not None and item_id == fam["canonical_id"]
        )
        family_url = "%s/osrs/%s/" % (SITE, fam["family_slug"])
        ref = {"family_slug": fam["family_slug"], "role": role}
        if dose is not None:
            ref["dose"] = dose
        block = {"family_ref": ref}
        if not fam["has_base_item"]:
            # Dose family with no base page yet: track the relationship at the
            # data level only. Emitting a canonical here would point at a page
            # that does not exist (and the 301s are base_only too).
            pass
        elif is_canonical:
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
                if not (mem["kind"] != "base"
                        and mem["id"] == fam["canonical_id"]
                        and mem["slug"] != fam["family_slug"])
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


def _rewrite_frontmatter_line(raw, key, value, indent="  "):
    """Replace the first `<indent><key>: ...` line's value in the frontmatter."""
    pat = re.compile(r"^(%s%s:).*$" % (re.escape(indent), re.escape(key)), re.M)
    return pat.sub(lambda m: "%s %s" % (m.group(1), value), raw, count=1)


def scaffold_base_pages(content_dir, result, today):
    """Create an unsuffixed base page for each dose family that lacks one.

    Clones the richest existing dose member (highest dose) to `<slug>.mdx`,
    rewrites title/name/slug to the unsuffixed base, bumps to mdx v4, and drops
    any stale family block. On re-resolve the new page is detected as the family
    base, so `--write` stamps its roster and `--redirect-json` 301s the doses.
    """
    created, skipped = [], []
    for fam in result["families"]:
        if fam["has_base_item"]:
            continue
        slug = fam["family_slug"]
        target = os.path.join(content_dir, slug + ".mdx")
        if os.path.exists(target):
            skipped.append(slug)
            continue
        src_path = None
        for m in sorted(fam["members"], key=lambda x: -(x["dose"] or 0)):
            p = os.path.join(content_dir, m["slug"] + ".mdx")
            if os.path.exists(p):
                src_path = p
                break
        if not src_path:
            skipped.append(slug)
            continue
        with open(src_path, encoding="utf-8") as fh:
            raw = fh.read()
        raw = _strip_family_blocks(raw)
        base_name = fam["family_name"]
        raw = re.sub(r"^title:.*$",
                     "title: %s | OSRS Price Data" % base_name, raw, count=1, flags=re.M)
        raw = _rewrite_frontmatter_line(raw, "name", base_name)
        raw = _rewrite_frontmatter_line(raw, "slug", slug)
        raw = _rewrite_frontmatter_line(raw, "mdx_version", "4")
        raw = _rewrite_frontmatter_line(raw, "mdx_updated", '"%s"' % today)
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(raw)
        created.append(slug)
    return {"created": created, "skipped": skipped}


def prune_members(content_dir, result):
    """Delete every non-base member `.mdx`; it collapses into the family page.

    The base page already carries the full roster (id/icon/value per member) in
    its `family` frontmatter, and axum 301s every member URL to the base, so the
    member files are redundant. Run AFTER write_families (which needs the member
    files to build the roster) and after the redirect JSON is emitted.
    """
    deleted, kept = [], []
    for fam in result["families"]:
        if not fam["has_base_item"]:
            continue
        family_slug = fam["family_slug"]
        for m in fam["members"]:
            if m["slug"] == family_slug:
                kept.append(m["slug"])
                continue
            p = os.path.join(content_dir, m["slug"] + ".mdx")
            if os.path.exists(p):
                os.remove(p)
                deleted.append(m["slug"])
    return {"deleted": deleted, "kept": kept}


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
    parser.add_argument("--redirect-json", default=None,
                        help="Write the 301 redirect pairs JSON (axum build.rs input)")
    parser.add_argument("--merge", action="store_true",
                        help="Merge --redirect-json into existing routes instead of overwriting "
                             "(required once members are pruned and can no longer be re-resolved)")
    parser.add_argument("--scaffold-base-pages", action="store_true",
                        help="Create unsuffixed base pages for dose families lacking one")
    parser.add_argument("--prune-members", action="store_true",
                        help="Delete non-base member MDX (collapsed into the family page)")
    parser.add_argument("--today", default="2026-06-29",
                        help="mdx_updated stamp for scaffolded pages")
    args = parser.parse_args()

    content_dir = find_content_dir(args.root)
    result = resolve(content_dir, args.min_members)
    if args.only:
        result["families"] = [
            f for f in result["families"] if f["family_slug"] == args.only
        ]
    if args.scaffold_base_pages:
        s = scaffold_base_pages(content_dir, result, args.today)
        print("scaffolded base pages: %d  skipped: %d" % (
            len(s["created"]), len(s["skipped"])))
        return
    if args.prune_members:
        p = prune_members(content_dir, result)
        print("pruned member pages: %d  kept(base): %d" % (
            len(p["deleted"]), len(p["kept"])))
        return
    text = json.dumps(result, indent=2)
    if args.json and not args.write:
        with open(args.json, "w", encoding="utf-8") as fh:
            fh.write(text)
    if args.redirect_json:
        pairs = redirect_pairs(result, base_only=True)
        merged = {}
        exists = os.path.exists(args.redirect_json)
        if exists and not args.merge:
            existing = json.load(open(args.redirect_json))["routes"]
            missing = [s for s, _ in existing
                       if s not in {p[0] for p in pairs}]
            if missing:
                sys.exit(
                    "refusing to overwrite %s: %d committed routes (e.g. %s) "
                    "are not currently resolvable because their member pages "
                    "were pruned. Pruning is one-way -- rerun with --merge to "
                    "union new routes into the committed set." % (
                        args.redirect_json, len(missing), missing[0]))
        if args.merge and exists:
            for s, d in json.load(open(args.redirect_json))["routes"]:
                merged[s] = d
        added = sum(1 for s, _ in pairs if s not in merged)
        for s, d in pairs:
            merged[s] = d
        routes = sorted(merged.items())
        payload = {
            "_comment": "Generated by kbve-osrs-families --redirect-json. "
                        "Consumed by axum-kbve build.rs to codegen the static "
                        "301 redirect table. Do not edit by hand. MERGE-ONLY: "
                        "member MDX pages listed here were pruned from disk and "
                        "cannot be regenerated, so future batches MUST pass "
                        "--merge or the resolver refuses to overwrite.",
        }
        comment = json.dumps(payload["_comment"])
        lines = ["{", "\t\"_comment\": %s," % comment, "\t\"routes\": ["]
        for i, (s, d) in enumerate(routes):
            tail = "," if i < len(routes) - 1 else ""
            lines.append("\t\t[%s, %s]%s" % (json.dumps(s), json.dumps(d), tail))
        lines.append("\t]")
        lines.append("}")
        with open(args.redirect_json, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
        print("wrote %d routes (%d new) from %d resolvable families -> %s" % (
            len(routes), added, result["family_count"], args.redirect_json))
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
