"""Shared loader for the astro-kbve docs content collections.

Walks apps/kbve/astro-kbve/src/content/docs/<collection>/**.mdx, parses the
YAML frontmatter and the MDX body, and yields one Page per file. The whole-site
analog of kbve.osrs._corpus.
"""
import os
import re
from collections import namedtuple

import yaml

CONTENT_REL = os.path.join(
    "apps", "kbve", "astro-kbve", "src", "content", "docs",
)

_FRONTMATTER = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.S)

Page = namedtuple("Page", "collection slug path frontmatter body")


def find_content_dir(root):
    """Resolve the docs content dir from a repo root, or walk up to find it."""
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


def split_frontmatter(text):
    """Return (frontmatter_dict, body_str). Empty dict if no frontmatter."""
    m = _FRONTMATTER.match(text)
    if not m:
        return {}, text
    try:
        fm = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError:
        fm = {}
    return (fm if isinstance(fm, dict) else {}), m.group(2)


def iter_pages(content_dir, only=None):
    """Yield Page for every .mdx under content_dir.

    only: optional collection name (top-level folder) to restrict the walk.
    """
    for dirpath, _dirs, files in os.walk(content_dir):
        rel = os.path.relpath(dirpath, content_dir)
        collection = rel.split(os.sep)[0] if rel != "." else ""
        if only and collection != only:
            continue
        for fname in sorted(files):
            if not fname.endswith(".mdx"):
                continue
            path = os.path.join(dirpath, fname)
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
            fm, body = split_frontmatter(text)
            slug = fname[:-4]
            yield Page(collection or "docs", slug, path, fm, body)
