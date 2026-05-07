# OpenAPI — Generated HTTP Spec

This directory holds the canonical OpenAPI 3.1 specification for the public HTTP surface served by [`axum-kbve`](../../../apps/kbve/axum-kbve/). Like the Zod / proto / SQL siblings under [`packages/data/`](../), the spec is a generated artifact — never hand-edited.

## Files

| File           | Purpose                         |
| -------------- | ------------------------------- |
| `openapi.json` | Generated OpenAPI 3.1 JSON spec |
| `README.md`    | This file                       |

## How It's Generated

1. Rust handlers in [`apps/kbve/axum-kbve/`](../../../apps/kbve/axum-kbve/) carry `#[utoipa::path(...)]` attributes
2. Request / response structs derive `utoipa::ToSchema`
3. The aggregator at [`apps/kbve/axum-kbve/src/openapi.rs`](../../../apps/kbve/axum-kbve/src/openapi.rs) (`ApiDoc`) lists every annotated handler + schema
4. `axum-kbve --emit-openapi` prints the spec to stdout
5. The nx target [`axum-kbve:emit-openapi`](../../../apps/kbve/axum-kbve/project.json) captures stdout into `openapi.json`

## Regenerating

```bash
# From the repo root
npx nx run axum-kbve:emit-openapi
```

Run this after any change to a `#[utoipa::path]` annotation, `ToSchema` derive, or a route registration in [`transport/https.rs`](../../../apps/kbve/axum-kbve/src/transport/https.rs). Commit the resulting `openapi.json` diff alongside the source change so reviewers can see the API surface delta.

## Consumers

Downstream artifacts derived from `openapi.json`:

| Consumer                               | Output                                                  | Generator                                     |
| -------------------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| TypeScript types                       | `apps/kbve/astro-kbve/src/data/schema/openapi/types.ts` | `packages/data/codegen/gen-openapi-types.mjs` |
| Astro `/llms.txt` build-time generator | runtime, no on-disk output                              | reads this `openapi.json` directly            |
| Astro `/dashboard/api/` Scalar viewer  | runtime fetch from `/api/openapi.json` (the live route) | n/a                                           |

## Source of Truth

The Rust annotations are the single source of truth. The disk artifact (`openapi.json`) is a frozen snapshot for build-time consumers that can't run the axum server. The live route at `https://kbve.com/api/openapi.json` always reflects the deployed binary.

## Related

- Rust handler annotations: [`apps/kbve/axum-kbve/src/transport/https.rs`](../../../apps/kbve/axum-kbve/src/transport/https.rs)
- OpenAPI aggregator (`ApiDoc`): [`apps/kbve/axum-kbve/src/openapi.rs`](../../../apps/kbve/axum-kbve/src/openapi.rs)
- Codegen scripts: [`packages/data/codegen/`](../codegen/)
