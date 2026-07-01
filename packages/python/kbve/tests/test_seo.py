from kbve.seo._pages import Page, split_frontmatter
from kbve.seo.profiles import profile_for
from kbve.seo.rules import RULES, build_ctx


def _page(slug, fm, collection="project"):
    return Page(collection, slug, "%s.mdx" % slug, fm, "")


def _run(page, ctx):
    profile = profile_for(page.collection)
    out = []
    for rule in RULES:
        out.extend(rule(page, ctx, profile))
    return {f.rule: f for f in out}


def test_split_frontmatter():
    fm, body = split_frontmatter("---\ntitle: X\n---\nhello\n")
    assert fm == {"title": "X"}
    assert body.strip() == "hello"


def test_split_frontmatter_none():
    fm, body = split_frontmatter("no frontmatter here")
    assert fm == {}
    assert body == "no frontmatter here"


def test_desc_too_long_flags_warn():
    p = _page("marketplace", {
        "title": "KBVE Marketplace",
        "description": "x" * 300,
        "tags": ["a"],
        "sem": 1,
    })
    findings = _run(p, build_ctx([p]))
    assert findings["desc-length"].severity == "warn"
    assert "> 160" in findings["desc-length"].message


def test_desc_too_short_flags_warn():
    p = _page("api", {"title": "KBVE API Layer", "description": "short",
                      "tags": ["a"], "sem": 1})
    findings = _run(p, build_ctx([p]))
    assert findings["desc-length"].severity == "warn"
    assert "< 70" in findings["desc-length"].message


def test_good_page_passes():
    p = _page("edge", {
        "title": "KBVE Edge Worker",
        "description": ("Cloudflare edge worker that fronts kbve.com, handles "
                        "routing, caching, and auth token verification at the "
                        "network boundary before origin."),
        "tags": ["edge", "cloudflare"],
        "sem": 1,
    })
    findings = _run(p, build_ctx([p]))
    assert "desc-length" not in findings
    assert "title-length" not in findings
    assert "sem-tracked" not in findings


def test_missing_sem_is_info():
    p = _page("api", {"title": "KBVE API Layer",
                      "description": "x" * 100, "tags": ["a"]})
    findings = _run(p, build_ctx([p]))
    assert findings["sem-tracked"].severity == "info"


def test_duplicate_description_is_error():
    a = _page("a", {"title": "Alpha Project", "description": "y" * 100,
                    "tags": ["t"], "sem": 1})
    b = _page("b", {"title": "Beta Project", "description": "y" * 100,
                    "tags": ["t"], "sem": 1})
    ctx = build_ctx([a, b])
    findings = _run(a, ctx)
    assert findings["desc-duplicate"].severity == "error"
