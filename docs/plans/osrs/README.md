# OSRS Item Data — Planning

| File                                           | What                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| [v4-thin-content.md](v4-thin-content.md)       | v4 schema spec + thin-content remediation plan    |
| [enrichment-runbook.md](enrichment-runbook.md) | Turnkey subagent spec to enrich an item to v4     |
| [audit.json](audit.json)                       | Latest STUB + BASIC sparse audit snapshot         |
| [families.json](families.json)                 | Item families (poison/dose clusters) + id 301 map |

## Regenerating the data

The survey/audit tooling lives in the `kbve` Python package under the `osrs`
extra (`packages/python/kbve/kbve/osrs/`). From `packages/python/kbve`:

```sh
uv run --extra osrs kbve-osrs-survey --root <repo-root>
uv run --extra osrs kbve-osrs-audit  --root <repo-root> --json <repo>/docs/plans/osrs/audit.json
```

`--root` is optional; the tools walk up to find the OSRS content dir if omitted.

## Item families (page collapse + 301s)

Near-identical items — poison variants `(p)/(p+)/(p++)`, potion doses
`(1)/(2)/(3)/(4)`, `(un)charged` forms, and Barrows degrade tiers
(`Dharok's helm 0/25/50/75/100`) — collapse onto ONE canonical base page.
Member pages are DELETED from disk and their URLs 301 (HTTP 308) to the base
at the axum-kbve layer. Poison collapse spans arrows/bolts/darts/javelins too,
not just weapons (`amethyst-arrow-p`, `-p-21334`, `-p-21336` →
`/osrs/amethyst-arrow/`).

Resolver: `kbve-osrs-families` (`packages/python/kbve/kbve/osrs/families.py`).
It keys on the MDX **filename**, not `osrs.slug` (slug collides across
variants). Families with no unsuffixed base item (most dose potions) get a base
page synthesized from the richest dose member.

### ⚠️ Pruning is one-way — always `--merge`

Once member pages are pruned they are gone from disk, so the resolver can NO
LONGER regenerate the full route set. A plain `--redirect-json` would emit only
currently-resolvable families and DROP every committed route. The resolver now
**refuses** to overwrite an existing redirect file unless you pass `--merge`
(it exits with an error listing the routes that would be lost). The committed
`apps/kbve/axum-kbve/src/transport/osrs_family_redirects.json` + each base
page's `family` frontmatter are the source of truth; `axum-kbve` `build.rs`
codegens the static 308 table from that JSON.

Full pipeline (from `packages/python/kbve`):

```sh
# 1. inspect families (writes docs/plans/osrs/families.json)
uv run --extra osrs kbve-osrs-families --root <repo> --json <repo>/docs/plans/osrs/families.json

# 2. synthesize base pages for dose families lacking an unsuffixed item
uv run --extra osrs kbve-osrs-families --root <repo> --scaffold-base-pages --today YYYY-MM-DD

# 3. stamp the family roster into each base page's frontmatter
uv run --extra osrs kbve-osrs-families --root <repo> --write

# 4. union new 301s into the committed table — --merge is MANDATORY
uv run --extra osrs kbve-osrs-families --root <repo> \
  --redirect-json <repo>/apps/kbve/axum-kbve/src/transport/osrs_family_redirects.json --merge

# 5. delete redundant member MDX (one-way; run last, after committing the JSON)
uv run --extra osrs kbve-osrs-families --root <repo> --prune-members
```

To add a NEW item that belongs to an existing collapsed family: create only the
member MDX, run steps 3–4 (with `--merge`), then step 5. Never regenerate the
redirect JSON without `--merge`.
