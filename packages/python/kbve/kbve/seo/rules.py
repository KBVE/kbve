"""Pluggable SEO rule registry.

Each rule is a function (page, ctx, profile) -> list[Finding]. Register by
appending to RULES. ctx carries site-wide state (dup maps) built once per run.
Adding a check later means appending one function; nothing else changes.
"""
from collections import namedtuple

Finding = namedtuple("Finding", "rule severity message")

ERROR, WARN, INFO = "error", "warn", "info"


def _desc(page):
    d = page.frontmatter.get("description")
    return d.strip() if isinstance(d, str) else None


def _title(page):
    t = page.frontmatter.get("title")
    return t.strip() if isinstance(t, str) else None


def rule_title_length(page, ctx, profile):
    t = _title(page)
    if not t:
        return [Finding("title-length", ERROR, "missing title")]
    n = len(t)
    if n < profile["title_min"]:
        return [Finding("title-length", WARN,
                        "title %d chars < %d" % (n, profile["title_min"]))]
    if n > profile["title_max"]:
        return [Finding("title-length", WARN,
                        "title %d chars > %d" % (n, profile["title_max"]))]
    return []


def rule_desc_length(page, ctx, profile):
    d = _desc(page)
    if not d:
        return [Finding("desc-length", ERROR, "missing description")]
    n = len(d)
    if n < profile["desc_min"]:
        return [Finding("desc-length", WARN,
                        "description %d chars < %d" % (n, profile["desc_min"]))]
    if n > profile["desc_max"]:
        return [Finding("desc-length", WARN,
                        "description %d chars > %d (truncated in SERP)"
                        % (n, profile["desc_max"]))]
    return []


def rule_title_duplicate(page, ctx, profile):
    t = _title(page)
    if t and len(ctx["titles"].get(t, ())) > 1:
        return [Finding("title-duplicate", ERROR,
                        "title shared with %d other pages"
                        % (len(ctx["titles"][t]) - 1))]
    return []


def rule_desc_duplicate(page, ctx, profile):
    d = _desc(page)
    if d and len(ctx["descs"].get(d, ())) > 1:
        return [Finding("desc-duplicate", ERROR,
                        "description shared with %d other pages"
                        % (len(ctx["descs"][d]) - 1))]
    return []


def rule_tags_present(page, ctx, profile):
    if not profile["expect_tags"]:
        return []
    tags = page.frontmatter.get("tags")
    if not (isinstance(tags, list) and tags):
        return [Finding("tags-present", WARN, "no tags")]
    return []


def rule_sem_tracked(page, ctx, profile):
    if page.frontmatter.get("sem") is None:
        return [Finding("sem-tracked", INFO, "not yet SEO-audited (sem unset)")]
    return []


RULES = [
    rule_title_length,
    rule_desc_length,
    rule_title_duplicate,
    rule_desc_duplicate,
    rule_tags_present,
    rule_sem_tracked,
]


def build_ctx(pages):
    """Site-wide state for cross-page rules."""
    titles, descs = {}, {}
    for p in pages:
        t = _title(p)
        d = _desc(p)
        if t:
            titles.setdefault(t, []).append(p.slug)
        if d:
            descs.setdefault(d, []).append(p.slug)
    return {"titles": titles, "descs": descs}
