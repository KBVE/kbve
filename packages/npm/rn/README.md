# @kbve/rn

React Native shared layer for KBVE mobile apps.

## Scope

Internal source library, consumed directly by Expo/React Native apps via the
`@kbve/rn` tsconfig path — **no build step**. Metro reads the TypeScript source.
A vite/tsc build target is intentionally omitted: vite library mode mangles
`react-native` imports and JSX.

## Layering

```
@kbve/rn        RN-only — agent-control protocol types, hooks, UI primitives.
                react + react-native are peerDependencies (never deps), so the
                consuming app owns the single React version. Mixing versions
                causes "Invalid hook call" / duplicate-renderer crashes.

apps/mobile     Expo app (future) — screens + wiring, thin shell.
```

Platform-agnostic logic (anything that does **not** import `react-native`)
belongs in a pure-TS lib so the Astro web side can share it too. Only put
code here that genuinely depends on React Native.

## Current surface

- `types.ts` — agent-control protocol: `AgentServerEvent`, `AgentClientCommand`,
  session/tool/diff shapes. Wire format for phone ↔ agent-server WebSocket.

## Monorepo requirements

- `node-linker=hoisted` in root `.npmrc` (already set) — Metro can't resolve
  pnpm's symlinked `node_modules`.
- Single hoisted React across the repo; the Expo SDK pins the version.
