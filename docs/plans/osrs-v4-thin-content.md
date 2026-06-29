# OSRS Item Data — v4 Spec & Thin Content Remediation

**Status:** Planning
**Scope:** Schema spec + content strategy for 4,525 OSRS item pages
**Target:** `mdx_version: 4`
**Last updated:** 2026-06-29

---

## 1. Problem Statement

The OSRS item corpus is 4,525 MDX pages under
`apps/kbve/astro-kbve/src/content/docs/osrs/`, all currently `mdx_version: 3`.
The v3 schema is rich (40+ nested protobuf messages in
`packages/data/proto/kbve/osrs.proto`), but the **data** behind ~1,100+ pages is
thin: a single boilerplate `about` sentence plus base ID/alchemy fields.

Representative thin page (`abyssal-dagger-p`, ~25 lines):

> "Abyssal dagger (p) is a members-only item in Old School RuneScape. High
> alchemy value: 69,001 coins. Grand Exchange buy limit: 8 per 4 hours."

4,525 near-identical pages with templated `about` text is textbook **thin /
doorway content**. Google de-indexes these, and `docs/skills/seo-mini.md` flags
the exact pattern: generic phrasing, no specificity, repetitive structure, no
original insight.

This is a real ranking/indexation risk, not a cosmetic one.

### Root causes

1. **Boilerplate sameness** — many pages share the same generated sentence shape.
2. **No variant consolidation** — poisoned/charged/degraded variants each get
   their own near-duplicate page, competing with the base item.
3. **No depth contract** — no per-archetype minimum for what a page must contain.
4. **No index gating** — every page is indexed regardless of content depth.

---

## 2. Decisions (locked)

| Decision               | Choice                     | Rationale                                                                         |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| Content source         | **OSRS Wiki ingest**       | Authoritative facts (drops, mechanics, history); CC BY-NC-SA 3.0 with attribution |
| Variant pages (~1,100) | **Canonical to base item** | Consolidates ranking signal, removes thin-content penalty, keeps pages reachable  |
| This planning pass     | **Schema spec only**       | Define v4 proto/Zod changes + migration; content pipeline scoped separately       |

---

## 3. v4 Schema Spec

All additions are **optional / additive** — v3 MDX stays valid. No field removed.
Source of truth is the proto; `src/data/schema/osrs/generated.ts` (Zod) auto-mirrors.

### 3.1 Variant / canonical block — NEW message

```proto
message OSRSVariant {
  optional int64 base_item_id   = 1;  // parent canonical item
  optional string base_slug     = 2;  // canonical URL target
  optional string variant_kind  = 3;  // poison|charged|degraded|ornament|locked|broken|placeholder|cosmetic
  optional string variant_label = 4;  // e.g. "(p++)", "(or)", "75"
  optional bool canonical_self  = 5;  // true = this IS the base item
}
```

Added to `OSRSItem` as field 42. Build emits `<link rel="canonical">` to
`base_slug` when `canonical_self = false`.

### 3.2 Wiki provenance block — NEW message

OSRS Wiki content is **CC BY-NC-SA 3.0** → attribution is mandatory. Also supplies
a freshness signal and a re-ingest dedup key.

```proto
message OSRSSource {
  optional string wiki_url        = 1;
  optional int64 wiki_page_id     = 2;
  optional int64 wiki_revision_id = 3;  // skip re-gen when unchanged
  optional string wiki_fetched_at = 4;  // ISO datetime
  optional string license         = 5;  // "CC BY-NC-SA 3.0"
  optional string attribution     = 6;  // rendered credit line
}
```

Added to `OSRSItem` as field 43.

### 3.3 Content tier / index gating — NEW enum + fields

Schema-level thin signal so the SSG decides index vs noindex deterministically.
Tier is **computed at ingest** from populated-section count, not hand-authored.

```proto
enum OSRSContentTier {
  OSRS_CONTENT_TIER_UNSPECIFIED = 0;
  OSRS_CONTENT_TIER_STUB        = 1;  // id+alch only        -> noindex
  OSRS_CONTENT_TIER_BASIC       = 2;  // stats+about         -> index, low priority
  OSRS_CONTENT_TIER_RICH        = 3;  // drops+market+related -> full index, sitemap priority
}
```

Added to `OSRSItem`:

```proto
optional OSRSContentTier content_tier = 44;
optional bool noindex                 = 45;  // STUB || canonical_self == false
```

### 3.4 Structured prose for passage indexing — extend OSRSAbout

seo-mini.md wants self-contained H2/H3 blocks, answer-first. A single `text` blob
can't support passage indexing.

```proto
message OSRSContentSection {
  string heading         = 1;  // H2/H3 text
  string body            = 2;  // 100-200 words, answer-first
  optional string anchor = 3;
}
message OSRSAbout {
  string text                          = 1;  // keep: lead summary, answer-first 40-50 words
  repeated OSRSContentSection sections = 2;  // NEW: history, combat use, obtaining, FAQ
}
```

### 3.5 Version bump

`mdx_version = 4`. Update field-40 comment: `4 = wiki-sourced, variant-canonical, tiered`.

---

## 4. Migration (define here, execute in later passes)

1. Edit proto → regenerate Zod (`generated.ts` auto-mirrors).
2. v3 MDX remains valid (all new fields optional) — no mass rewrite this pass.
3. Separate ingest pass populates `variant`, `source`, `content_tier`,
   `about.sections`, then flips pages to `mdx_version: 4`.

### Open question — variant detection

- **Option A (heuristic):** regex on slug suffix (`-p`, `-p-`, charge numbers, `-or`).
- **Option B (authoritative):** OSRS Wiki redirect graph — variant → base. Ties to
  the Wiki-ingest decision and is the more accurate source.

Recommendation: B (Wiki redirect graph), fall back to A for items with no redirect.

---

## 5. Phase Roadmap

This plan is staged. Each phase has its own follow-up section/PR.

- **Phase 1 — Schema (this doc):** finalize v4 proto fields, regen Zod, document migration.
- **Phase 2 — Front matter:** normalize/clean v3 front matter, wire `content_tier` +
  `noindex` + canonical emission into the Astro page/sitemap layer.
- **Phase 3 — Content depth:** per seo-mini.md, define answer-first lead + section
  templates (history / combat use / obtaining / market / FAQ) sourced from Wiki.
- **Phase 4 — Variant scoping:** enumerate every variant class
  (poison/charged/degraded/ornament/locked/broken/placeholder/cosmetic), set the
  canonical + content strategy per class.

---

## 6. Variant Classes (Phase 4 stub — to expand)

| Kind                 | Slug signature (example)     | Default strategy                                    |
| -------------------- | ---------------------------- | --------------------------------------------------- |
| poison               | `-p`, `-p-`, `(p+)`, `(p++)` | canonical → base, noindex                           |
| charged              | charge count in name         | canonical → base unless mechanics differ materially |
| degraded             | `100/75/50/25/0`, `(broken)` | canonical → base                                    |
| ornament             | `(or)`, `(g)`, `(t)`         | canonical → base, cosmetic note                     |
| locked / placeholder | `(l)`, placeholder           | noindex, minimal page                               |

To be fully enumerated against the corpus in Phase 4.
