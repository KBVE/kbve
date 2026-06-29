# OSRS v4 Enrichment Runbook (for subagents)

Turnkey spec to upgrade one or more OSRS item pages to `mdx_version: 4`. A subagent
should be able to enrich an item using **only this file + one example MDX** — no need
to read the Zod schema, proto, or components. Goal: maximum data + content, zero
fabrication, schema-valid on the first try.

Canonical worked example: `apps/kbve/astro-kbve/src/content/docs/osrs/tinderbox.mdx`.
Schema contract (what each archetype needs): `v4-thin-content.md` §8.

---

## 0. Workflow (worktree → PR)

Enrichment edits land via a worktree and a PR to `dev` — never committed straight to
`dev`/`main`.

```sh
# from repo root
git worktree add ../kbve-osrs-enrich -b feat/osrs-v4-<batch>
cd ../kbve-osrs-enrich
# ... enrich items ...
git add apps/kbve/astro-kbve/src/content/docs/osrs/<slug>.mdx
git commit -m "feat(osrs): v4 enrich <items>"   # no Claude co-author line
gh pr create --base dev --title "feat(osrs): v4 enrich <batch>" --body "..."
```

LFS smudge can 404 in fresh worktrees — prefix git ops with `GIT_LFS_SKIP_SMUDGE=1` if so.

---

## 1. Hard rules

1. **MDX is the source of truth.** Edit the existing `<slug>.mdx`. Never regenerate.
2. **Preserve base fields verbatim:** `id`, `name`, `slug`, `examine`, `members`,
   `icon`, `value`, `lowalch`, `highalch`, `limit`. Do not invent or change them.
3. **No fabrication.** Every number/fact must come from the OSRS Wiki page for that
   item. Fetch it. If the page has no figure, omit the field — never guess.
4. **Attribution.** Add the `source` block (Wiki URL + `CC BY-NC-SA 3.0` + fetch date).
5. **Bump** `mdx_version: 4` and set `mdx_updated` to the run date (ISO `YYYY-MM-DD`).
6. **Skip / canonical, do not enrich:**
    - **Variants** (poison `(p)`, ornament `(g)/(t)/(or)`, trimmed `(h1..5)`, degraded
      `100/75/50/25/0`, charged): these canonical → base; leave minimal.
    - **No Wiki page** (speculative/future content — e.g. Sailing-era sigils, Ironwood,
      Raging Echoes, Golovanova): cannot Wiki-source. Flag and skip; do not invent.
    - The one **blank-name** STUB: skip; flag as a broken file for manual fix.
7. **Validate before commit** (§4). A page that fails `astro sync` is not done.

---

## 2. Per-item algorithm

0. **Pre-fetch the Wiki prose** (do this once for the whole batch, before any
   per-item work) — see §6. This caches clean Markdown to
   `scripts/.cache/osrs-wiki/<slug>.md` so you read a local file instead of doing
   a live `WebFetch` per item (deterministic, full-fidelity, near-zero tokens).
1. Read the current `<slug>.mdx`; keep base fields.
2. Read the pre-fetched `scripts/.cache/osrs-wiki/<slug>.md` for mechanics/stats,
   how obtained/made (levels, XP, materials), notable uses, update history, and
   trivia. (Fall back to a live `WebFetch` of the Wiki page only if the cache is
   missing.) Exact infobox NUMBERS may already be populated by
   `enrich-v3-wiki-stats.mjs` — trust existing curated fields; do not overwrite.
3. Pick the archetype (§8 matrix) and fill its **required blocks** (§3 shapes).
4. Write `about` as an **object**: `text` (answer-first lead, 40–60 words) +
   `sections[]` (the archetype's section set; each 80–160 words, answer-first).
5. Add `faq[]` (3–5, query-shaped questions; always "Is it members-only?" + an
   obtain/use Q), `trivia[]` (≥2 sourced facts), `related_items[]` (≥2), `source`,
   and `url: https://kbve.com/osrs/<slug>/` (canonical absolute page URL).
6. Keep the body unchanged:

    ```mdx
    import OSRSItemPanel from '@/components/osrs/OSRSItemPanel.astro';
    import OSRSAdsenseCard from '@/components/osrs/OSRSAdsenseCard.astro';

    <OSRSItemPanel data={frontmatter.osrs} />

    <OSRSAdsenseCard />
    ```

---

## 3. Exact field shapes (copy these — all keys optional unless noted)

YAML lives under the top-level `osrs:` key. Unknown keys are silently stripped, so
match these names exactly.

```yaml
about: # may be a plain string, but prefer the object form
    text: 'answer-first lead' # required if about is an object
    sections:
        - heading: 'How to use X for Firemaking'
          anchor: usage # optional
          body: 'answer-first passage, 80-160 words'

faq: # → FAQPage JSON-LD + accordion
    - question: 'Is X members-only?'
      answer: 'Answer-first fact, then context. 40-60 words.'

trivia: # → Trivia card (lore/history facts)
    - 'One sourced fact.'

equipment:
    slot: feet # head|cape|neck|ammo|weapon|body|shield|legs|hands|feet|ring|2h
    weapon_type: whip # weapons only
    attack_speed: 4 # weapons; game ticks
    requirements: { defence: 30 } # any skill key + optional quest: "Name"
    attack_bonus: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 }
    defence_bonus: { stab: 10, slash: 11, crush: 12, magic: 0, ranged: 0 }
    other_bonus:
        { melee_strength: 1, ranged_strength: 0, magic_damage: 0, prayer: 0 }
    weight: 1.36

food:
    { heals: 12, type: pie, cooking_level: 20, cooking_xp: 110, burn_level: 54 }

consumable: # potions (MDX key is `potion` OR `consumable`; use `potion`)
potion: { doses: 4, herblore_level: 66, herblore_xp: 142.5, effect: 'summary' }

recipes:
    - skill: cooking # lowercase skill name
      level: 20
      xp: 110
      facility: Range
      ticks: 1 # optional
      product: Meat pie
      materials:
          - { item_name: Uncooked meat pie, quantity: 1 }

teleport:
    type: tablet # jewelry|tablet|scroll|spell|other
    destinations:
        - {
              name: West Ardougne,
              requirements: 'Completion of Biohazard',
              members_only: true,
          }

drop_table:
    sources:
        - {
              source: Gargoyle,
              combat_level: 111,
              quantity: '1',
              rarity: uncommon,
              drop_rate: '1/128',
          }

quest_data:
    quests:
        - {
              quest_name: Imp Catcher,
              role: required,
              quantity: 1,
              notes: 'context',
          }

market_strategy:
    notes: ['unique market insight', '...']
trading_tips: ['query-useful tip', '...']

related_items:
    - {
          item_name: Rune boots,
          slug: rune-boots,
          relationship: upgrade,
          description: 'why',
      }
      # relationship: upgrade|downgrade|component|product|set-piece|alternative|variant

source:
    wiki_url: 'https://oldschool.runescape.wiki/w/Item_Name'
    license: 'CC BY-NC-SA 3.0'
    wiki_fetched_at: 'YYYY-MM-DD'

url: 'https://kbve.com/osrs/<slug>/' # canonical absolute page URL (must be a valid URL)
mdx_version: 4
mdx_updated: 'YYYY-MM-DD'
```

Notes: `recipes[].skill` and `skilling_sources[].skill` are lowercase skill names.
`drop_table.rarity` is a string (`common`/`uncommon`/`rare` or a fraction). `quantity`
and `drop_rate` are strings. Numbers stay unquoted.

---

## 4. Validation (run from repo root)

```sh
./kbve.sh -nx astro-kbve:sync     # MUST pass — validates frontmatter against Zod
./kbve.sh -nx astro-kbve:check    # typecheck; ignore the 2 pre-existing baseline errors
                                  # (rnweb/RnWebDemo.tsx, api/ci-registry.json.ts)
```

A live dev server (`nx dev astro-kbve` → `localhost:4321/osrs/<slug>`) shows the
rendered About sections, Trivia card, FAQ accordion, and the `FAQPage` JSON-LD in
page source. (Dev server does not boot in headless CI/sandbox; run it locally.)

---

## 5. Candidate queue

Regenerate the thin-item list anytime:

```sh
cd packages/python/kbve
uv run --extra osrs kbve-osrs-audit --root <repo> --json <repo>/docs/plans/osrs/audit.json
```

`audit.json` → `stubs[]` (id+alch only) and `basics[]` (sparse), each with
`variant` (skip if non-null) and `members`. Prioritise by **player value / search
demand**, not emptiness — a STUB like `chaos-tiara` is core Runecraft infrastructure,
not a throwaway. Defer pure cosmetics (team capes, trimmed sets, novelty hats).

Current high-value real STUBs (Wiki-sourceable, members unless noted):
extended-super-antifire-2, divine-super-defence-potion-1, earmuffs, ogre-coffin-key,
strength-mix-2, extended-antifire-2, mystic-robe-bottom-light, olive-oil-3,
roast-bird-meat, lime.

Done examples (mirror these): `tinderbox` (tool, sections+faq+trivia), `meat-pie`
(food), `adamant-boots` (armor+drops), `yellow-bead` (quest), `chaos-tiara` (skilling),
`west-ardougne-teleport-tablet` (teleport).

---

## 6. Wiki prose pre-fetch (token saver)

Two complementary Wiki tools live in `apps/kbve/astro-kbve/scripts/`:

- **`enrich-v3-wiki-stats.mjs`** — pulls exact infobox NUMBERS (equipment bonuses,
  requirements, weight) into frontmatter. Never overwrites curated fields.
- **`fetch-osrs-wiki-md.mjs`** — fetches the rendered article via the MediaWiki
  parse API and converts it to clean, token-optimized Markdown with
  [mdream](https://github.com/harlan-zw/mdream), caching one file per item. This
  is the PROSE source for `about` / `sections` / `faq` / `trivia`.

Run the prefetch before enriching (from `apps/kbve/astro-kbve`):

```sh
# specific items
node scripts/fetch-osrs-wiki-md.mjs earmuffs ogre-coffin-key strength-mix-2
# whole STUB queue (skips variants/no-name automatically)
node scripts/fetch-osrs-wiki-md.mjs --from-audit --limit 20
```

Output: `scripts/.cache/osrs-wiki/<slug>.md` (gitignored), each with a `source`
header (Wiki URL + CC BY-NC-SA 3.0 + fetch date). If a fetch is skipped with
"no Wiki page", that item is speculative/future content (§1.6) — flag, do not invent.

`mdream` is a root devDependency. The fetch uses `clean: true` plus a navbox/reference
filter, so output keeps the infobox + prose and drops site chrome.
