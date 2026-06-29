# Workflows Content Collection — Plan

Astro content collection documenting agentic workflows (Claude Code superpowers,
multi-agent orchestration, skill chains, prompt recipes).

Named `workflows` (NOT `skills`) to avoid collision with Claude Code's own skills
concept + the plugin skill registry.

## Decision: full proto pipeline

Workflows are structured records (trigger, category, ordered steps, agent roles,
related links) — not just prose. So they ride the same `*db` proto pipeline as
`spelldb` / `skilldb`: MDX frontmatter = source of truth, proto = wire/codegen
shape, generated zod = validation, data.json/binpb = machine-readable catalog any
consumer (agent tooling, web listing, Rust) can decode.

MDX body still holds the long-form prose; frontmatter holds the structured spec.

## Pipeline (mirror spelldb)

1. **proto**: `packages/data/proto/workflow/workflow.proto`
    - package `workflow`; `csharp_namespace = "KBVE.Proto.Workflow"`
    - messages `Workflow` + `WorkflowStep` + `WorkflowRegistry { repeated Workflow workflows = 1; }`
    - enums `WorkflowCategory`, `WorkflowKind`
2. **zod config**: `packages/data/codegen/workflow-zod-config.json`
    - `const_array` enum mode, `stripPrefix`, `caseTransform: lowercase`
    - refinements as needed
3. **register in `gen-all.mjs`** registry: `{ name: 'workflow', protoFile: 'workflow/workflow.proto', package: 'workflow' }`
4. **barrel**: add `export * from './workflow-schema.js';` to
   `packages/data/codegen/generated/index.ts`
5. **Astro schema**: `apps/kbve/astro-kbve/src/data/schema/IWorkflowSchema.ts`
    - import `WorkflowSchema` + enum schemas from `@kbve/proto/workflow-schema`
    - `export const IWorkflowSchema = WorkflowSchema.passthrough();`
    - re-export from `src/data/schema/index.ts`
6. **content collection**: in `src/content.config.ts`
    - `import { IWorkflowSchema } from '@/data/schema'`
    - `const workflows = defineCollection({ loader: glob({ pattern: '**/*.mdx', base: './src/content/docs/workflows' }), schema: IWorkflowSchema })`
    - add `workflows` to `collections` export
7. **content**: `src/content/docs/workflows/*.mdx` (index.mdx + sample workflows)
8. **data gen**: `packages/data/codegen/gen-workflow-data.mjs` (copy
   gen-spelldb-data.mjs; swap dir + enum prefixes + `workflow.WorkflowRegistry`)
   → `generated/workflow-data.json` + `.binpb`
9. **zod gen**: `packages/data/codegen/gen-workflow-zod.mjs` (copy
   gen-spelldb-zod.mjs)
10. **nx targets** in `apps/kbve/astro-kbve/project.json`:
    - `sync:workflow` (gen-workflow-data.mjs; inputs MDX + script + descriptor,
      outputs json+binpb, cache true)
    - `sync:workflow-zod` (protoc descriptor + gen-workflow-zod.mjs) — match
      `sync:mapdb-zod` shape
11. **sidebar**: `astro.config.mjs` → add a `Workflows` group with
    `autogenerate: { directory: 'workflows' }` (own top-level group or under a
    Docs/Agents group — NOT under "Game Data").

## Proto draft — Workflow message

```proto
syntax = "proto3";
package workflow;
option csharp_namespace = "KBVE.Proto.Workflow";

// Broad purpose bucket for the workflow.
enum WorkflowCategory {
  WORKFLOW_CATEGORY_UNSPECIFIED = 0;
  WORKFLOW_CATEGORY_PROCESS = 1;        // brainstorming, planning, debugging
  WORKFLOW_CATEGORY_IMPLEMENTATION = 2; // building/scaffolding
  WORKFLOW_CATEGORY_RESEARCH = 3;       // fan-out search, synthesis
  WORKFLOW_CATEGORY_REVIEW = 4;         // code review, verification
}

// Shape of the workflow runtime.
enum WorkflowKind {
  WORKFLOW_KIND_UNSPECIFIED = 0;
  WORKFLOW_KIND_SKILL = 1;        // single skill / prompt recipe
  WORKFLOW_KIND_CHAIN = 2;        // ordered multi-skill sequence
  WORKFLOW_KIND_ORCHESTRATION = 3;// multi-agent fan-out / pipeline
}

// One step in a workflow.
message WorkflowStep {
  uint32 order = 1;
  string title = 2;
  optional string detail = 3;
  optional string agent_ref = 4;   // subagent / skill ref this step invokes
  optional bool parallel = 5;      // runs concurrently with siblings
}

// A documented agentic workflow. MDX frontmatter under
// astro-kbve/src/content/docs/workflows/*.mdx is the source of truth.
message Workflow {
  string ref = 1;            // 'systematic-debugging'
  uint32 key = 2;            // stable numeric
  string id = 3;             // ULID
  string name = 4;
  optional string description = 5;

  WorkflowCategory category = 6;
  WorkflowKind kind = 7;

  optional string trigger = 8;     // when-to-use text
  optional string emoji = 9;

  repeated string tags = 10;
  repeated WorkflowStep steps = 11;
  repeated string related_refs = 12; // other workflow refs

  // Provenance — where this workflow comes from.
  optional string source_plugin = 13;  // e.g. 'superpowers'
  optional string source_version = 14;
  optional string source_url = 15;
  optional string author = 16;

  optional bool drafted = 17;
}

message WorkflowRegistry {
  repeated Workflow workflows = 1;
}
```

## MDX frontmatter example

```yaml
title: 'Systematic Debugging'
ref: 'systematic-debugging'
key: 1
id: '01K...'
name: 'Systematic Debugging'
category: 'process'
kind: 'skill'
trigger: 'Use when encountering any bug, test failure, or unexpected behavior'
emoji: '🪲'
tags: ['debugging', 'process']
steps:
    - order: 1
      title: 'Reproduce'
      detail: 'Get a reliable repro before theorizing'
    - order: 2
      title: 'Isolate'
      detail: 'Bisect to the smallest failing case'
related_refs: ['test-driven-development']
source_plugin: 'superpowers'
source_version: '6.0.3'
```

## Decisions to confirm

- **UE consumer?** No UE need. NO `sync:workflow-uecpp`. → DEFER (likely never).
- **Step granularity**: nested `WorkflowStep` repeated (chosen) vs flat string
  list. Nested chosen — supports order/agent_ref/parallel for orchestration
  workflows. Keep refs flat (no deep nesting beyond steps).
- **`related_refs` / `agent_ref`** are plain string refs (matches feedback:
  flat refs). No nested objects.
- **Sidebar home**: own top-level `Workflows` group vs under an `Agents`/`Docs`
  group. → recommend own top-level group.

## Verify

- `./kbve.sh -nx data:proto:lint` (buf lint) if available
- `npx tsx packages/data/codegen/gen-all.mjs workflow` regen zod
- `./kbve.sh -nx astro-kbve:sync:workflow` regen data
- `./kbve.sh -nx astro-kbve:build`
