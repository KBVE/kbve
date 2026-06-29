"""Shared loaders and classification for the OSRS MDX item corpus."""
import os
import re

import yaml

CONTENT_REL = os.path.join(
    "apps", "kbve", "astro-kbve", "src", "content", "docs", "osrs",
)

RICH_SECTIONS = [
    "equipment", "drop_table", "drop_sources", "related_items",
    "market_strategy", "recipes", "skilling_sources", "shops",
    "special_attack", "passive_effects", "consumable", "food", "cooking",
    "farming", "teleport", "prayer", "gathering", "slayer", "construction",
    "charges", "ammunition", "quest_data", "set_bonus", "treasure_trail",
    "trading_tips", "material",
]

SOURCE_SECTIONS = (
    "drop_table", "drop_sources", "skilling_sources", "shops", "recipes",
)
CONTEXT_SECTIONS = (
    "related_items", "market_strategy", "special_attack", "passive_effects",
    "trading_tips", "set_bonus",
)

_ORNAMENT_KINDS = {
    "or": "ornament", "g": "ornament", "t": "ornament", "l": "locked",
    "i": "imbued", "e": "enchanted", "u": "unfinished", "cr": "corrupted",
}
_FRONTMATTER = re.compile(r"^---\n(.*?)\n---", re.S)
_ORNAMENT_RE = re.compile(r"\((or|g|t|h\d?|cr|l|i|e|nz|c|u|deadman|ce|bh)\)")
_POISON_RE = re.compile(r"\(p\+?\+?\)")
_DEGRADE_RE = re.compile(r"\b(100|75|50|25|0)\)?$")


def find_content_dir(root):
    """Resolve the OSRS content dir from a repo root, or walk up to find it."""
    if root:
        candidate = os.path.join(root, CONTENT_REL)
        if os.path.isdir(candidate):
            return candidate
    here = os.path.abspath(os.path.dirname(__file__))
    while True:
        candidate = os.path.join(here, CONTENT_REL)
        if os.path.isdir(candidate):
            return candidate
        parent = os.path.dirname(here)
        if parent == here:
            raise FileNotFoundError(
                "Could not locate %s; pass --root <repo>" % CONTENT_REL,
            )
        here = parent


def classify_variant(name):
    """Classify an item name into a variant kind, or None if it is a base item."""
    n = name.lower()
    if _POISON_RE.search(n):
        return "poison"
    m = _ORNAMENT_RE.search(n)
    if m:
        g = m.group(1)
        if g.startswith("h"):
            return "trimmed_heraldic"
        return _ORNAMENT_KINDS.get(g, "cosmetic_other")
    if _DEGRADE_RE.search(name.strip()) or "(broken)" in n or "(deg)" in n:
        return "degraded"
    if "(uncharged)" in n or "(charged)" in n:
        return "charged"
    return None


def about_text(osrs):
    """Extract the about string whether it is a plain string or an object."""
    ab = osrs.get("about")
    if isinstance(ab, dict):
        return ab.get("text", "") or ""
    if isinstance(ab, str):
        return ab
    return ""


def iter_items(content_dir):
    """Yield (filename, osrs_dict) for every parseable MDX item page."""
    for fname in sorted(os.listdir(content_dir)):
        if not fname.endswith(".mdx"):
            continue
        path = os.path.join(content_dir, fname)
        with open(path, encoding="utf-8", errors="replace") as fh:
            raw = fh.read()
        match = _FRONTMATTER.match(raw)
        if not match:
            continue
        try:
            data = yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError:
            continue
        osrs = data.get("osrs", {})
        if not isinstance(osrs, dict):
            continue
        yield fname, osrs, raw


def tier_for(osrs):
    """Return (tier, present_sections, about_len) for an item."""
    present = [s for s in RICH_SECTIONS if s in osrs and osrs[s]]
    abl = len(about_text(osrs))
    has_sources = any(s in present for s in SOURCE_SECTIONS)
    has_context = any(s in present for s in CONTEXT_SECTIONS)
    rich = sum([has_sources, has_context]) + (1 if abl > 250 else 0)
    if not present and abl < 200:
        return "STUB", present, abl
    if rich >= 2:
        return "RICH", present, abl
    return "BASIC", present, abl
