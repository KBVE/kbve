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
    "body_floor": 0,
    "expect_tags": True,
}

PROFILES = {
    # Software/service catalog pages — short, dense, keyword-front-loaded.
    "project": {
        "title_min": 10,
        "title_max": 60,
        "desc_min": 70,
        "desc_max": 160,
        "body_floor": 0,
        "expect_tags": True,
    },
}


def profile_for(collection):
    return {**DEFAULT, **PROFILES.get(collection, {})}
