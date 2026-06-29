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
`packages/data/proto/kbve/osrs.proto`).

### What a corpus survey actually found (2026-06-29)

The initial fear was ~1,100+ templated/doorway pages. A full survey (see §2) and a
15-item content sample disproved that:

- **The bulk of content is genuinely unique and specific**, not boilerplate. Sampled
  `market_strategy` / `about` blocks carry real game facts (quest reqs, XP rates,
  smithing ratios, smelt success rates, teleport lists) that differ per item. The
  3,834 tier-RICH pages are really rich.
- A short `about` field does **not** mean a thin page — many short-prose items
  (e.g. `rune-platebody`, `ranarr-seed`, `prayer-potion-4`) compensate with rich
  `market_strategy` + `trading_tips`. Of 1,921 pages with `about` < 200 chars, ~1,300
  are still tier-RICH and acceptable as-is.

**The genuinely thin set is therefore small:** 73 STUB pages + a sparse subset of
the 618 BASIC pages. Representative STUB (`abyssal-dagger-p`, ~25 lines):

> "Abyssal dagger (p) is a members-only item in Old School RuneScape. High
> alchemy value: 69,001 coins. Grand Exchange buy limit: 8 per 4 hours."

These remain a real (if narrow) thin/doorway risk per `docs/skills/seo-mini.md`.

### Root causes (narrowed)

1. **Long-tail stubs** — ~73 pages with id+alch only, mostly variants.
2. **No variant consolidation** — poison/ornament/trimmed variants get their own
   near-duplicate page competing with the base item (471 flagged; see §6).
3. **No index gating** — every page is indexed regardless of depth.
4. **De-duplication is NOT a concern** — earlier "templated sameness" hypothesis was
   tested and rejected; this workstream is dropped.

---

## 2. Decisions (locked)

| Decision            | Choice                     | Rationale                                                                         |
| ------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| Content source      | **OSRS Wiki ingest**       | Authoritative facts (drops, mechanics, history); CC BY-NC-SA 3.0 with attribution |
| Variant pages (471) | **Canonical to base item** | Consolidates ranking signal, removes thin-content penalty, keeps pages reachable  |
| This planning pass  | **Schema spec only**       | Define v4 proto/Zod changes + migration; content pipeline scoped separately       |

---

## 2b. Survey Results (2026-06-29)

Full scan of all 4,525 MDX front matter via `kbve-osrs-survey` (see README; raw audit in `audit.json`).

> Note: counts below are the original baseline. The audit snapshot regenerates
> with the corpus, so STUB/BASIC totals drop as items are upgraded to v4.

- **Versions:** v3 = 4,524; 1 file missing front matter (fix).
- **Members:** 3,711 · **F2P:** 814.
- **Line count:** min 26, median 91, p90 115, max 536.
- **`about` length:** median 227 chars; **1,921 pages (42%) < 200 chars** (not all thin — see §1).

**Content tier (structural):**

| Tier  | Count | Meaning                                               |
| ----- | ----- | ----------------------------------------------------- |
| RICH  | 3,834 | sources + context + prose — verified genuinely unique |
| BASIC | 618   | stats or prose, partial                               |
| STUB  | 73    | id + alch only                                        |

**Section fill (near-universal sections confirmed unique, not templated):**
related_items 4,110 · market_strategy 4,067 · material 3,389 · trading_tips 3,027 ·
equipment 2,048 · recipes 2,046 · drop_table 1,304 · shops 887 · treasure_trail 571.

**Variants flagged: 471** — poison 203 · ornament 118 · trimmed_heraldic 45 ·
unfinished 36 · degraded 33 · enchanted 21 · charged 15.
(degraded undercounted — Barrows `100/75/50/25/0` states need a tighter regex in Phase 4.)

### Remediation priority (post-survey)

| Pri | Set                   | Count | Action                                                        |
| --- | --------------------- | ----- | ------------------------------------------------------------- |
| P0  | STUB                  | 73    | enrich or `noindex`; most are variants → canonical            |
| P1  | BASIC (sparse subset) | ⊂ 618 | audit, fill genuinely empty ones                              |
| P2  | variants              | 471   | canonical-to-base; poison/ornament/trimmed add nothing unique |
| —   | RICH                  | 3,834 | leave as-is; no de-dup needed                                 |

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

### 3.4b Rich content fields — IMPLEMENTED (2026-06-29)

Shipped end-to-end on `tinderbox` as the v4 exemplar (schema + components + JSON-LD + content):

- **`about.sections[]`** — `{ heading, body, anchor? }`; rendered by `OSRSAbout.astro` as
  self-contained passages (passage indexing).
- **`faq[]`** — `{ question, answer }`; new `OSRSFaq.astro` (accordion) **and `FAQPage`
  JSON-LD** added to `OSRSItemJsonLd.astro` → eligible for FAQ rich results + AI citation.
- **`trivia[]`** — string lore facts; new `OSRSLore.astro` card ("<Item> Trivia").
- **`url`** — canonical absolute page URL (`https://kbve.com/osrs/<slug>/`),
  `z.string().url()`. Derivable from slug but stored explicitly for the record;
  backfilled across existing v4 items.

Zod (`generated.ts`): added `OSRSContentSectionSchema`, `OSRSFaqEntrySchema`,
`about.sections`, top-level `faq` + `trivia`, and `hasFaq` / `hasLore` guards.
`astro sync` validates clean. These are MDX-only today; mirror into the proto in §3.5.

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
- **Phase 5 — Guides & blog layer:** add a long-form content collection
  (hub-and-spoke) that links down to item pages — see §7.

---

## 7. Guides & Blog Content Layer (hub-and-spoke)

> **Re-roled post-survey:** the corpus is already content-solid, so this layer is a
> **growth / ranking play**, not a thin-content rescue. It targets head/mid-tail
> search demand that no single item page can rank for.

Individual item pages are inherently transactional and fact-shaped — they will
never carry strong E-E-A-T or original insight on their own. The hub layer adds
long-form, original guides and blog posts that:

- demonstrate Experience/Expertise (original analysis, recommendations, comparisons),
- are highly quotable for AI citation (GEO) — the format engines actually surface,
- **link down to item pages**, fixing orphan pages and passing internal authority,
- absorb head/mid-tail search demand ("best melee weapon osrs", "x vs y", "money
  making p2p") that no single item page can rank for.

Item pages are the **spokes**; guides are the **hubs**.

### 7.1 New content collection — `osrs-guides`

Separate Astro content collection (NOT in the item schema). Lives under
`src/content/docs/osrs-guides/` (path TBD), own Zod schema. Proposed front matter:

```yaml
guide:
    title: 'OSRS Melee Weapon Progression (1–99 Attack)'
    slug: melee-weapon-progression
    type: progression # progression|comparison|moneymaking|boss|skill|listicle|blog
    summary: '...' # answer-first lead, 40-50 words
    related_item_ids: [4151, 12006, 22324] # items this guide features
    related_guides: [boss-slayer-gear] # sibling hubs
    author: '...' # E-E-A-T attribution
    published: '2026-07-01'
    updated: '2026-07-01'
    source: # same provenance block as items where Wiki-sourced
        wiki_url: '...'
        license: 'CC BY-NC-SA 3.0'
```

### 7.2 Item ↔ guide linkage (build-computed, single source of truth)

Guides declare `related_item_ids`. The build **inverts** this map and renders a
"Featured in guides" block on each referenced item page. Items do **not** store
guide refs in their own front matter — avoids drift, keeps one source of truth.

No new item proto field strictly required; the inverted index is a build artifact.
(Optional convenience field `repeated string featured_in_guides = 46;` on
`OSRSItem` can cache the inversion if needed at runtime — decide in Phase 5.)

### 7.3 Guide types to scope (Phase 5)

| Type          | Example                                   | Items it links         | Search intent        |
| ------------- | ----------------------------------------- | ---------------------- | -------------------- |
| progression   | Melee/Range/Mage gear 1–99                | tiered weapons/armor   | "best X weapon osrs" |
| comparison    | Whip vs Tentacle vs Rapier                | 2–4 items head-to-head | "x vs y osrs"        |
| moneymaking   | High-alch / flipping / processing methods | inputs + outputs       | "osrs money making"  |
| boss / slayer | Per-boss gear + drop table                | drops → item pages     | "<boss> guide osrs"  |
| skill         | Training method per skill                 | materials + produce    | "osrs <skill> guide" |
| listicle      | "10 best F2P weapons"                     | curated set            | head-term capture    |
| blog          | Updates, meta analysis, opinion           | contextual links       | freshness + brand    |

Guides reuse the §3.4 `OSRSContentSection` prose model (answer-first lead +
self-contained H2/H3 passages) for passage indexing and AI citation.

### 7.4 Blog vs guides — one collection, two types

The `osrs-guides` collection's `type` field discriminates two intents:

- **Guides** (`progression`/`comparison`/`moneymaking`/`boss`/`skill`/`listicle`) —
  evergreen, item-linked, target stable search demand. Route: `/osrs/guides/`.
- **Blog** (`type: blog`) — timely posts: game-update recaps, meta-shift analysis,
  opinion. Carries `published`/`updated` for a freshness signal and links into both
  item pages and evergreen guides. Route: `/osrs/blog/`.

Same Zod schema, same MDX renderer, same item↔content inversion (§7.2). Splitting by
`type` at the routing layer keeps one pipeline while giving blog its own feed/index.
Blog posts can also reuse the `faq[]` + `about.sections[]` content model from §3.4b.

## 6. Variant Classes (counts from §2b survey)

| Kind             | Count | Slug/name signature          | Default strategy                                    |
| ---------------- | ----- | ---------------------------- | --------------------------------------------------- |
| poison           | 203   | `(p)`, `(p+)`, `(p++)`       | canonical → base, noindex                           |
| ornament         | 118   | `(g)`, `(t)`, `(or)`         | canonical → base, cosmetic note                     |
| trimmed_heraldic | 45    | `(h1..h5)`                   | canonical → base, cosmetic note                     |
| unfinished       | 36    | `(u)`                        | keep if distinct recipe role, else canonical        |
| degraded         | 33\*  | `100/75/50/25/0`, `(broken)` | canonical → base                                    |
| enchanted        | 21    | `(e)` bolts                  | keep if distinct mechanics (proc effects)           |
| charged          | 15    | `(uncharged)`/`(charged)`    | canonical → base unless mechanics differ materially |

\* degraded undercounted — Barrows charge states need a tighter regex. Full
enumeration + per-class final decisions land in Phase 4.

---

## 8. Per-Archetype Content Contract (v4)

The contract that makes v4 enrichment repeatable: given an item's archetype, this
defines the minimum blocks, prose sections, FAQ themes, and trivia each page must
carry. Ingest/agents fill against this so every page hits the same depth bar.

### 8.0 Universal baseline (every item)

Required on all 4,525 pages regardless of type:

- **Identity:** `id`, `name`, `slug`, `examine`, `members`, `icon`, `value`,
  `lowalch`/`highalch`, `limit`.
- **`about.text`** — answer-first lead, 40–60 words, unique (no boilerplate template).
- **`about.sections[]`** — ≥1 archetype section (see below).
- **`faq[]`** — ≥3 entries; always include "Is it members-only?" + one obtain/use Q.
- **`trivia[]`** — ≥2 sourced lore/history facts.
- **`source`** — Wiki URL + `CC BY-NC-SA 3.0` + fetched date.
- **`related_items[]`** — ≥2 (upgrade/downgrade/component/alternative/set-piece).
- **`mdx_version: 4`**, `mdx_updated` ISO date.

> Variants (per §6) are exempt: they canonical → base and may stay minimal/noindex.

### 8.1 Archetype matrix

| Archetype                                     | Detector                              | Required blocks                                  | `about.sections`                           | FAQ themes                                       | JSON-LD         |
| --------------------------------------------- | ------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------ | --------------- |
| **Weapon**                                    | `equipment.slot` ∈ weapon/2h          | equipment, special_attack?, requirements         | Combat use, Obtaining, vs alternatives     | level req, dps/speed, where to get, spec         | Product         |
| **Armor**                                     | `equipment.slot` ∈ head/body/legs/…   | equipment (defence), set_bonus?                  | Defence role, Obtaining, Progression       | level req, set bonus, vs next tier               | Product         |
| **Ammunition**                                | `ammunition`                          | ammunition, equipment?                           | Usage, Enchant effect?, Obtaining          | which weapons, enchant proc, fletch level        | Product         |
| **Food**                                      | `food`                                | food, recipes?                                   | Healing & combo-eat, Cooking, Obtaining    | heal amount, cook level, burn level, members     | Product + HowTo |
| **Potion**                                    | `consumable`/`potion`                 | consumable, recipes                              | Effect & doses, Herblore, Obtaining        | effect, doses, herblore level, decant            | Product + HowTo |
| **Skilling resource** (log/ore/bar/hide/herb) | `material` + gathering/recipes        | gathering?, recipes, skilling_sources?, material | Gathering, Processing/uses, Market role    | level, xp/hr, what it makes, members             | Product + HowTo |
| **Seed / farming**                            | `farming`                             | farming, related_items (produce)                 | Growing, Yield & protection, Market        | farm level, grow time, payment, profit           | Product + HowTo |
| **Teleport**                                  | `teleport`                            | teleport, recipes?                               | Destination & use, Making it, Requirements | quest req, how to make, where it goes, charges   | Product + HowTo |
| **Quest item**                                | `quest_data`                          | quest_data, drop_table?                          | Quest role, Obtaining                      | which quest, how to get, members, post-quest use | Product         |
| **Tool**                                      | properties only, Firemaking/skill use | (about-heavy), related_items                     | Usage, Where to buy                        | members, consumed?, cheapest source, weapon?     | Product         |
| **Jewellery / charges**                       | `charges`/`teleport`+`equipment`      | charges, teleport?, equipment                    | Effect, Charging/degrade, Obtaining        | charges, recharge, degrade, members              | Product         |
| **Currency / misc**                           | none of the above                     | related_items, market_strategy?                  | What it is, Where used                     | what is it, where to get/spend, members          | Product         |

### 8.2 FAQ authoring rules (SEO/GEO)

- Phrase each `question` as a real search query ("How much does X heal?",
  "What level to make X?"). One concept per Q.
- `answer` is answer-first: lead with the fact in the first sentence, then context.
  40–60 words. No marketing voice.
- 3–5 FAQs per page. These render the `FAQPage` JSON-LD (§3.4b) → rich results.
- Never fabricate — every answer traces to the Wiki `source`.

### 8.3 Quality bar ("amazing v4")

A page passes v4 review only if: lead is unique & answer-first; every archetype
section present; ≥3 query-shaped FAQs; ≥2 trivia; all numbers Wiki-verified; ≥2
related items; renders all cards without empty/`—` blocks; FAQPage + Product (+ HowTo
where applicable) JSON-LD validate.
