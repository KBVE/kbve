"""Per-collection SEO profiles.

Thresholds trace to docs/skills/seo-mini.md. Profiles are data: a new
collection is a new dict entry, no rule code changes. DEFAULT applies to any
collection without an explicit profile.
"""

DEFAULT = {
    "title_min": 15,
    "title_max": 60,
    "desc_min": 70,
    "desc_max": 160,
    "expect_tags": True,
    # software = page should emit a SoftwareSourceCode node, which Head.astro
    # derives from source_path / app_name frontmatter.
    "expect_software": False,
    "body_min_chars": 0,
}

PROFILES = {
    # Software/service catalog pages — short, dense, keyword-front-loaded.
    # Head.astro derives SoftwareSourceCode JSON-LD from source_path/app_name.
    "project": {
        "title_min": 10,
        "title_max": 60,
        "desc_min": 70,
        "desc_max": 160,
        "expect_tags": True,
        "expect_software": True,
        "body_min_chars": 500,
    },
}


def profile_for(collection):
    return {**DEFAULT, **PROFILES.get(collection, {})}
