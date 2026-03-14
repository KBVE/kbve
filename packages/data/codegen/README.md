# Codegen — Schema Generation Scripts and Configs

This directory contains **code generation tooling** that reads proto definitions and compiled descriptors to produce typed schemas for downstream applications.

## Structure

| File / Directory | Purpose |
|-----------------|---------|
| `descriptors/` | Compiled `.binpb` proto descriptors (build artifacts) |
| `zod-config.json` | OSRS item Zod schema generation config |
| `discordsh-zod-config.json` | Discordsh Zod schema generation config |
| `gen-discordsh-zod.mjs` | Script to generate `discordsh-schema.ts` from proto + config |

## Usage

```bash
# Generate discordsh Zod schemas
npx tsx packages/data/codegen/gen-discordsh-zod.mjs
```

## How It Works

1. Proto source files live in [`../proto/`](../proto/)
2. Protos are compiled to `.binpb` descriptors stored in [`descriptors/`](descriptors/)
3. Generation scripts read a `.binpb` + a `*-zod-config.json` and output typed Zod schemas into app directories
4. The codegen library lives at `packages/npm/devops/src/lib/codegen/`

## Adding a New Schema

1. Define your `.proto` in `../proto/`
2. Compile it to a `.binpb` and place in `descriptors/`
3. Create a `<name>-zod-config.json` with field overrides, refinements, etc.
4. Create a `gen-<name>-zod.mjs` script (see `gen-discordsh-zod.mjs` as a template)

## Related

- Proto source definitions: [`../proto/`](../proto/)
