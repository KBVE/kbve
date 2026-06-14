# @kbve/core

Portable, **framework-agnostic** application core for KBVE. Pure TypeScript —
no React, no React Native, no DOM. Shared by the Astro web side, the Expo
mobile app (`@kbve/rn`), and any future shell.

## The boundary (Crux-shaped)

```
shell  --CoreEvent-->  core.update(state, event)  --> { state, effects }
shell  <--AgentViewModel--  core.view(state)
shell executes effects, feeds results back as CoreEvents
```

Rule: **the shell reports events and renders view models; the core decides what
events mean.** Business logic, validation, the agent-session state machine, and
view-model projection live here — never in components, hooks, or stores.

## Pieces

- `types.ts` — agent-control wire protocol (`AgentServerEvent` / `AgentClientCommand`).
- `state.ts` — `CoreState`, `CoreEvent`, `CoreEffect`, `AgentViewModel`.
- `reducer.ts` — `tsCore: AgentCore` = `initial()` / `update()` / `view()`. Pure, deterministic, testable without a UI, network, or simulator.
- `store.ts` — `AgentStore` (`subscribe` / `getSnapshot` / `dispatch`) + `EffectExecutor` interface. `getSnapshot` returns a stable ref between dispatches → safe for `useSyncExternalStore`.

## Crux swap path

`AgentCore` is the seam. `tsCore` implements it in TypeScript today. A future
Rust [Crux](https://redbadger.github.io/crux/) core implements the same
interface behind an opaque `update(ArrayBuffer): ArrayBuffer` TurboModule —
`AgentStore`, the `useAgent` hook, and components do not change. Adopting Crux
becomes a core-implementation swap, not an architecture change. See
`project_kbve_react_native` memory for the trigger conditions.

Effect execution (WebSocket, navigation, secure storage) is the shell's job and
lives in `@kbve/rn` / the app, not here — that is why this package stays
DOM-free.
