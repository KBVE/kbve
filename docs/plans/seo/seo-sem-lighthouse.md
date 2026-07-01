# Whole-Site SEO / SEM / Lighthouse — Spec

**Status:** Planning
**Scope:** All `apps/kbve/astro-kbve` content (7,500+ pages across ~30 docs
collections), site-wide search quality.
**Goal:** Accurate, measured, re-usable search-quality tooling — deterministic
in-repo auditing → measurement feedback loop → runtime performance/a11y.
**Last updated:** 2026-07-01

---

## 1. Problem Statement

kbve.com already has the on-page SEO *plumbing* but no way to know it is
*accurate at scale*, and no data telling us what to fix next.

### What already exists (on `dev`)

- `src/lib/seo.ts` → `createSeo` emits a schema.org `Organization` graph.
- `src/components/navigation/Head.astro` — per-page `og:*` / `twitter:*` /
  JSON-LD / `canonical` / `robots` (`noindex`) from frontmatter.
- `@astrojs/sitemap` integration.
- Docs schema carries `sem: z.number().int().optional()` (absent = audit
  pending, `1` = audited), plus `noindex` and `canonical` frontmatter.
- `docs/skills/seo-mini.md` — E-E-A-T + content-quality thresholds (the source
  of truth for audit rules).
- Webmaster tool page (`docs/webmaster`) linking external audits + citing the
  Core Web Vitals "good" thresholds.
- Prior **manual** `seo-audit-application` batches — page-by-page content
  deepening. Correct but does not scale to 7,500 pages.

### The gaps

1. **No automated cross-page audit.** `sem` is stamped by hand and binary;
   nothing checks title/description length, keyword front-loading, canonical
   validity, duplicate titles/descriptions, orphan pages, thin content, missing
   JSON-LD, or index-gating across the whole corpus.
2. **No measurement.** No Google Search Console data flows back into the repo,
   so prioritization is guesswork rather than driven by real impressions /
   clicks / position.
3. **No runtime quality signal.** No Lighthouse / Core Web Vitals lane; nothing
   asserts LCP / CLS / INP or accessibility against the built site.

---

## 2. Decisions (locked)

| Decision                 | Choice                                             | Rationale |
| ------------------------ | -------------------------------------------------- | --------- |
| Auditor language / home  | **Python module `kbve.seo`** in `packages/python/kbve` | Mirrors the proven `kbve.osrs` tooling the team already runs; ad-hoc or CI; no new stack |
| Auditor input            | **Static frontmatter + MDX body** across all collections | Deterministic, fast, offline, re-runnable |
| Check design             | **Pluggable rule registry + per-collection profiles** | "Upgrade as we build" — new checks/collections are append-only data |
| Shared contract          | **`findings.json`, page-keyed**                    | Every pillar reads/writes it; composable |
| Measurement store        | **ClickHouse, one wide table**                     | Matches `metrics.kbve.com` precedent |
| SEM scope                | **Organic only**                                   | No paid-ad tooling; "SEM" = search marketing broadly. Measurement pipeline left open to plug paid data later |
| Lighthouse               | **Separate pillar (`lhci`)**, not the Python auditor | Runtime CWV/a11y cannot be derived from frontmatter |
| Rollout                  | **Phased P1→P5**, each pillar independently runnable | Ship value early, review real findings before writeback |

---

## 3. Architecture — 3 pillars

### 3.1 Pillar 1 — Content / metadata auditor (`kbve.seo`)

New module `packages/python/kbve/kbve/seo/`, opt-in extra `seo`
(`pyyaml`, already core), mirroring `kbve.osrs`:

| File         | Role |
| ------------ | ---- |
| `_pages.py`  | Shared page iterator. Walks **all** `src/content/docs/**` collections, parses frontmatter + body, yields `Page(collection, slug, path, frontmatter, body)`. Whole-site analog of `osrs/_corpus.py`. |
| `profiles.py`| Per-collection config: content floors, required frontmatter, index policy, attribution rules. Data, not code. |
| `rules.py`   | The rule registry — each check is `(page, ctx) -> list[Finding]` with `id`, `severity`, and the `seo-mini.md` threshold it enforces. |
| `audit.py`   | Runs rules × profiles over every page, emits `findings.json`. Script `kbve-seo-audit`. |
| `report.py`  | Rolls findings into a human summary (per-collection health, worst offenders, orphan/dup lists). Script `kbve-seo-report`. |
| `stamp.py`   | Writes fixes back to frontmatter — set/advance `sem`, set `noindex` on thin/gated pages, flag missing/invalid `canonical`. Idempotent; `--dry-run` is the default. Script `kbve-seo-stamp`. |
| `gsc.py`     | **Pillar 2** — GSC → ClickHouse loader + prioritizer (built in P3). |

`[project.scripts]` additions:

```toml
kbve-seo-audit  = "kbve.seo.audit:main"
kbve-seo-report = "kbve.seo.report:main"
kbve-seo-stamp  = "kbve.seo.stamp:main"
```

#### Rule registry (the upgrade core)

- A rule is a small pure function returning `Finding(page, rule_id, severity,
  message, hint)`. Rules live in one `RULES` list; **adding a check later =
  append one function.**
- `ctx` carries site-wide state built once per run: all slugs, the
  internal-link graph, canonical targets, and the sitemap set — so cross-page
  rules (orphans, duplicate titles/descriptions, broken canonical) work.
- Rules are **collection-aware** through the active profile, so an `osrs`
  product page and a `journal` blog post get different floors from the *same*
  rule code.
- **Severity → CI:** `error` fails the build, `warn` reports, `info` informs.

#### Initial rule set (from `seo-mini.md`)

| Rule id                | Severity | Checks |
| ---------------------- | -------- | ------ |
| `title-length`         | warn     | Title 15–60 chars, present |
| `title-keyword-front`  | info     | Primary keyword in first ~5 words |
| `desc-length`          | warn     | Meta description 70–160 chars, present |
| `desc-duplicate`       | error    | Description unique across corpus |
| `title-duplicate`      | error    | Title unique across corpus |
| `canonical-valid`      | error    | `canonical`, if set, resolves to a real page / redirect target |
| `heading-hierarchy`    | warn     | Single H1, no skipped levels |
| `thin-content`         | warn     | Body below the collection's topical floor and no compensating rich fields |
| `jsonld-present`       | info     | Article/Product JSON-LD present where the profile expects it |
| `orphan-page`          | warn     | Page has ≥1 inbound internal link (not orphaned) |
| `index-gating`         | info     | Thin/gated pages carry `noindex`; rich pages do not |
| `image-alt`            | warn     | Body/hero images have alt text |

Thresholds are profile values, not literals in the rule — tuning is a config
edit.

#### `findings.json` contract (shared by all pillars)

```jsonc
{
  "generated": "<stamped after run>",
  "summary": { "pages": 7523, "errors": 12, "warns": 340, "collections": {…} },
  "pages": {
    "/osrs/prayer-potion/": {
      "collection": "osrs",
      "audit":  { "score": 82, "findings": [ { "rule": "desc-length", "severity": "warn", … } ] },
      "gsc":    null,           // filled by Pillar 2
      "lhci":   null            // filled by Pillar 3
    }
  }
}
```

One page-keyed record, enriched by each lane. This is what makes the three
pillars composable and the whole thing re-runnable.

### 3.2 Pillar 2 — GSC → ClickHouse measurement (`gsc.py`)

- Daily Google Search Console **Search Analytics** pull → one wide ClickHouse
  table: `(date, page, query, clicks, impressions, ctr, position, device,
  country)` — mirrors the `metrics.kbve.com` one-wide-table pattern.
- Auth: GCP service account with GSC read scope, secret delivered via ESO.
- Scheduling: a cron/n8n job (organic-only; the schema leaves room to union
  paid-campaign rows later without a migration).
- **Prioritizer:** joins GSC rows to `findings.json` — high-impression /
  low-CTR / position-just-below-fold pages with open audit findings surface at
  the top of the fix queue. Turns "what should we improve" into a ranked,
  data-backed list.
- Surfaced in Grafana (existing dashboard stack).

### 3.3 Pillar 3 — Lighthouse CI (`lhci`)

- `lhci autorun` against the **built** Astro output (or a preview deploy) over a
  sampled, representative page set per collection (not all 7,500 — sampling
  logged so coverage is honest).
- Assertions = the Core Web Vitals "good" budgets the webmaster page already
  cites: **LCP < 2.5 s, CLS < 0.1, INP < 200 ms**, plus accessibility and
  best-practices category floors.
- Results → ClickHouse (same one-wide-table convention) for trend lines.
- Complementary to GSC: GSC/CrUX = real-user field CWV; LHCI = lab CWV.

---

## 4. Data flow

```
content/docs/**  ──_pages──▶ audit (rules × profiles) ──▶ findings.json ──▶ report (summary)
                                                       └──▶ stamp (sem / noindex / canonical; --dry-run default)

GSC API ──gsc──▶ ClickHouse (wide table) ──▶ join to findings ──▶ prioritized fix queue ──▶ Grafana

built HTML ──lhci──▶ CWV / a11y assertions ──▶ ClickHouse (trends) ──▶ Grafana
```

---

## 5. Phase roadmap

| Phase | Deliverable | Gate |
| ----- | ----------- | ---- |
| **P1** | `_pages` + `profiles` + `rules` + `audit` + `report` — read-only whole-site health snapshot | Review real findings before any writeback |
| **P2** | `stamp` (sem / noindex / canonical writeback, `--dry-run` default) + CI job gating on `error` findings | Dry-run diff reviewed on a sample collection first |
| **P3** | `gsc.py` GSC→ClickHouse loader + prioritizer + Grafana panel | Service-account secret provisioned via ESO |
| **P4** | Lighthouse CI lane + CWV/a11y budgets + trend store | Sampling strategy agreed |
| **P5+** | New rules / profiles / collections as the site grows | Steady-state upgrade path |

Each phase ships independently; P1 delivers value with zero writeback risk.

---

## 6. Reuse & upgrade guarantees

- **Rules and profiles are append-only data** — new checks and new collections
  never touch existing rule code.
- **`findings.json` is a stable page-keyed contract** — new lanes add a key,
  they don't reshape the record.
- **Each pillar runs independently** — audit works with no ClickHouse; GSC and
  LHCI enrich but never block the auditor.
- **ClickHouse tables follow the existing one-wide-table convention** — no
  bespoke schema.
- **`seo-mini.md` stays the single source of truth for thresholds** — profiles
  reference it; drift is a config edit, not a code change.

---

## 7. Open questions (resolve during implementation)

1. **Internal-link graph source** — parse MDX bodies for `[..](..)` +
   component link props, or reuse a build-time link map if one exists? Affects
   `orphan-page` / `canonical-valid` accuracy.
2. **Collection profile defaults** — which of the ~30 collections need explicit
   profiles vs a sane default? (osrs, journal, application, project, mc are the
   large ones.)
3. **GSC property scope** — single `kbve.com` domain property, or per-section?
4. **LHCI runner host** — existing ARC runners vs a dedicated job; where the
   built site / preview URL comes from.
5. **CI gate strictness at rollout** — start `error`-gating in report-only mode,
   promote to build-failing after the corpus is clean.
