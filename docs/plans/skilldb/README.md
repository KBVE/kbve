# skilldb Content Collection — Plan

Astro content collection for generic gaming skills (crafting, alchemy, smithing,
mining, etc). Full `*db` proto-pipeline sibling to `itemdb`, `npcdb`, `spelldb`,
`mapdb`, `tiledb`.

## Decision: full proto pipeline

skilldb IS game data — decoded by web HUD + Rust sim (and optionally UE). So it
mirrors the `spelldb` pipeline exactly (the closest analog: small flat message,
web + Rust consumers, no Unity).

MDX frontmatter = source of truth. Proto = wire/codegen shape.

## Pipeline (mirror spelldb)

1. **proto**: `packages/data/proto/skill/skilldb.proto`
    - package `skill`; `csharp_namespace = "KBVE.Proto.Skill"`
    - messages `Skill` + `SkillRegistry { repeated Skill skills = 1; }`
    - enums for category/etc (see schema below)
2. **zod config**: `packages/data/codegen/skilldb-zod-config.json`
    - `const_array` enum mode, `stripPrefix`, `caseTransform: lowercase`
    - refinements (e.g. `skill.Skill.max_level` `.min(1).max(999)`)
3. **register in `gen-all.mjs`** registry: `{ name: 'skilldb', protoFile: 'skill/skilldb.proto', package: 'skill' }`
4. **barrel**: add `export * from './skilldb-schema.js';` to
   `packages/data/codegen/generated/index.ts`
5. **Astro schema**: `apps/kbve/astro-kbve/src/data/schema/ISkillSchema.ts`
    - import `SkillSchema` + enum schemas from `@kbve/proto/skilldb-schema`
    - `export const ISkillSchema = SkillSchema.passthrough();`
    - re-export from `src/data/schema/index.ts`
6. **content collection**: in `src/content.config.ts`
    - `import { ISkillSchema } from '@/data/schema'`
    - `const skilldb = defineCollection({ loader: glob({ pattern: '**/*.mdx', base: './src/content/docs/skilldb' }), schema: ISkillSchema })`
    - add `skilldb` to `collections` export
7. **content**: `src/content/docs/skilldb/*.mdx` (index.mdx + sample skills)
8. **data gen**: `packages/data/codegen/gen-skilldb-data.mjs` (copy
   gen-spelldb-data.mjs; swap dir + enum prefixes + `skill.SkillRegistry`)
   → `generated/skilldb-data.json` + `.binpb`
9. **nx targets** in `apps/kbve/astro-kbve/project.json`:
    - `sync:skilldb` (gen-skilldb-data.mjs; inputs MDX + script + descriptor,
      outputs json+binpb, cache true)
    - `sync:skilldb-zod` (protoc descriptor + gen-skilldb-zod.mjs) — match
      `sync:mapdb-zod` shape
    - `gen-skilldb-zod.mjs` (copy gen-spelldb-zod.mjs)
10. **sidebar**: `astro.config.mjs` Game Data group → add
    `{ label: 'SkillDB', items: [{ autogenerate: { directory: 'skilldb' } }] }`

## Proto draft — Skill message

```proto
syntax = "proto3";
package skill;
option csharp_namespace = "KBVE.Proto.Skill";

enum SkillCategory {
  SKILL_CATEGORY_UNSPECIFIED = 0;
  SKILL_CATEGORY_GATHERING = 1;   // mining, fishing, woodcutting
  SKILL_CATEGORY_PRODUCTION = 2;  // crafting, smithing, alchemy, cooking
  SKILL_CATEGORY_COMBAT = 3;
  SKILL_CATEGORY_SUPPORT = 4;     // utility / passive
}

message Skill {
  string ref = 1;            // 'alchemy'
  uint32 key = 2;            // stable numeric
  string id = 3;             // ULID
  string name = 4;
  optional string description = 5;
  SkillCategory category = 6;
  optional string emoji = 7;
  optional string img = 8;
  optional uint32 max_level = 9;        // default 99
  optional string xp_curve = 10;        // ref to curve formula / table
  optional uint32 base_xp = 11;         // xp per base action
  repeated string action_refs = 12;     // crafting/gather actions tied to skill
  repeated string item_refs = 13;       // itemdb refs unlocked/produced
  optional bool drafted = 14;
}

message SkillRegistry {
  repeated Skill skills = 1;
}
```

## MDX frontmatter example

```yaml
title: 'Alchemy'
ref: 'alchemy'
key: 1
id: '01K...'
name: 'Alchemy'
category: 'production'
emoji: '⚗️'
max_level: 99
base_xp: 10
action_refs: ['brew-potion']
item_refs: ['health-potion']
```

## Decisions to confirm

- **UE consumer?** spelldb ships `KBVESpellDB` plugin + `sync:spelldb-uecpp`.
  skilldb: defer UE (no `sync:skilldb-uecpp` for v1) unless chuck/rentearth need
  it. → recommend DEFER.
- **XP curve modeling**: string ref to a curve (flexible) vs inline numeric
  fields. → recommend `xp_curve` ref + `base_xp`, keep formula in code/table.
- **Cross-refs**: `item_refs` / `action_refs` are plain string refs (matches
  feedback: itemdb flat refs). No nested objects.
- **Per-game vs generic**: generic schema; game-specific skills authored as
  separate MDX. No game filter in the shared pipeline (matches feedback:
  shared data no game filter).

## Verify

- `./kbve.sh -nx data:proto:lint` (buf lint) if available
- `npx tsx packages/data/codegen/gen-all.mjs skilldb` regen zod
- `./kbve.sh -nx astro-kbve:sync:skilldb` regen data
- `./kbve.sh -nx astro-kbve:build`
