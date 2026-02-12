# Plan: `@kbve/astro` — Unified Astro Component Library

## Context

The monorepo has two older Astro packages (`packages/astro-ve` and `packages/astropad`) that are not publishable npm packages. The goal is to create a unified, publishable `@kbve/astro` package under `packages/npm/astro/` with:

- Proper Nx build/publish pipeline (matching `laser` and `droid` patterns)
- React component support via Astro islands
- Direct integration with `@kbve/droid` (worker status + event bus)
- Lean foundation — migrate components from old packages incrementally

Both `astro-ve` and `astropad` will be deprecated immediately.

## Architecture

**Hybrid build:** Vite compiles TS/TSX → ES module + `.d.ts`. Publish step copies `.astro` source files into dist. `package.json` exports map both.

## File Plan

```
packages/npm/astro/
├── project.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.lib.json
├── tsconfig.spec.json
├── README.md
└── src/
    ├── index.ts
    ├── hooks/
    │   ├── useDroid.ts
    │   └── useDroidEvents.ts
    ├── react/
    │   ├── DroidProvider.tsx
    │   └── DroidStatus.tsx
    ├── components/
    │   ├── DroidProvider.astro
    │   └── DroidStatus.astro
    └── utils/
        └── cn.ts
```

## Commit Plan (conventional, no co-authors)

1. `feat(astro): scaffold @kbve/astro package with build pipeline`
2. `feat(astro): add useDroid and useDroidEvents hooks`
3. `feat(astro): add DroidProvider and DroidStatus React components`
4. `feat(astro): add Astro wrapper components for droid integration`
5. `feat(astro): add cn utility`
6. `chore: add @kbve/astro path alias to tsconfig.base`
7. `chore: deprecate astro-ve and astropad packages`
