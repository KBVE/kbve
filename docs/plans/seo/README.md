# SEO / SEM / Lighthouse — Planning

Whole-site search-quality tooling for `kbve.com` (all `astro-kbve` content
collections). Deterministic in-repo auditing first, then a measurement feedback
loop, then runtime performance/accessibility. Built to be re-used and upgraded
as the site grows.

| File                                         | What                                                       |
| -------------------------------------------- | ---------------------------------------------------------- |
| [seo-sem-lighthouse.md](seo-sem-lighthouse.md) | Full spec: 3-pillar architecture, rule registry, phases  |

## Pillars (at a glance)

1. **Content/metadata auditor** — `kbve.seo` Python module, mirrors `kbve.osrs`.
   Static frontmatter+MDX analysis across every collection.
2. **GSC → ClickHouse measurement** — real query performance drives what to fix.
3. **Lighthouse CI** — lab Core Web Vitals + accessibility against built output.

The Python auditor is the entry point; see the spec for the phase roadmap.
