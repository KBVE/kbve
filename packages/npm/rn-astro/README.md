# @kbve/rn-astro

Bridge that runs **`@kbve/rn`** (React Native) components on the **web** via
`react-native-web`, wired for **Astro** islands. The optimized path lives here
so each Astro app doesn't re-derive the build config.

Tracks [#12495](https://github.com/KBVE/kbve/issues/12495).

## How it works

`@kbve/rn` components are built on RN primitives (`View`/`Text`/`Pressable`/
`StyleSheet`) + universal deps, with `.web.tsx` splits for the native-only bits
(HCaptcha, Sandbox, offload). `react-native-web` maps those primitives to the
DOM, so the same components render on web. This package supplies:

1. **`kbveRnAstro()`** — an Astro integration that injects the
   `react-native` → `react-native-web` vite alias + `.web.*` resolve extensions
   (so the web variants win) + prebundles `react-native-web`.
2. **Re-exported web-safe components** — the presentational `@kbve/rn` UI kit
   (Text, Surface, Stack, Divider, Badge, Button, PressableSurface, Screen,
   Gradient, AppCard, CardList, MenuItem, MenuList, EntityRenderer, Footer,
   feedback states, `tokens`, `useTheme`).

## Usage

Two wiring modes, depending on how the consuming app resolves `@kbve/*`.

### A. Workspace apps (own `package.json`, npm/pnpm-linked)

```js
// astro.config.mjs
import { kbveRnAstro } from '@kbve/rn-astro/integration';

export default defineConfig({
	integrations: [react(), kbveRnAstro()],
});
```

### B. Nx tsconfig-path apps (e.g. `astro-kbve`, no `node_modules/@kbve`)

`astro.config.mjs` is loaded by node before Vite, so bare `@kbve/*`
specifiers don't resolve there — inline the same alias instead of importing
the integration:

```js
// astro.config.mjs
export default defineConfig({
	vite: {
		resolve: {
			alias: [
				{ find: /^react-native$/, replacement: 'react-native-web' },
			],
			extensions: [
				'.web.tsx',
				'.web.ts',
				'.web.jsx',
				'.web.js',
				'.tsx',
				'.ts',
				'.jsx',
				'.js',
				'.json',
			],
		},
		optimizeDeps: { include: ['react-native-web'] },
	},
});
```

Then point the `@kbve/rn` tsconfig paths at the **web barrels** so the
native-only `./rails` + `./nav` graphs (which pull untranspiled
`@expo/vector-icons`) never enter the web bundle:

```jsonc
// tsconfig.json
"@kbve/rn": ["../../../packages/npm/rn/src/index.web.ts"],
"@kbve/rn/ui": ["../../../packages/npm/rn/src/ui/index.web.ts"],
"@kbve/rn-astro": ["../../../packages/npm/rn-astro/src/index.ts"]
```

### Rendering

```astro
---
// any .astro page
import { AppCard } from '@kbve/rn-astro';
const model = {
	id: '1',
	title: 'Cryptothrone',
	badge: 'LIVE',
	badgeTone: 'success',
};
---

<AppCard client:only="react" model={model} />
```

The component runs as a hydrated React island, rendered through
`react-native-web`. Use `client:only="react"` (RN-web components don't SSR).

A live POC ships in `astro-kbve` at `/rn-web-poc/`
(`src/components/rnweb/RnWebDemo.tsx`) — Gradient + Surface + Stack + Text +
Button variants + a hydrated counter, all from `@kbve/rn` primitives.

## Universal vs native-only boundary

| Layer                                                                    | Web status      | Mechanism                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@kbve/core` (Store, signals, events, net, auth, chat)                   | universal       | no RN imports — runs as-is                                                                                                                                                                                         |
| RN primitives (View/Text/Pressable/StyleSheet/Image/FlatList/TextInput)  | universal       | `react-native` → `react-native-web` alias                                                                                                                                                                          |
| `@kbve/rn` UI kit (primitives, cards, menus, feedback, Gradient, Footer) | universal       | re-exported from `@kbve/rn-astro`                                                                                                                                                                                  |
| HCaptcha, Sandbox, openExternal, viewTransition, offload, kv store       | universal       | `.web.tsx`/`.web.ts` split — web variant wins via resolve extensions                                                                                                                                               |
| Nav (`AppBar`, `TabBar`, `NavShell`) + `navStore`/`useTab`               | **native-only** | pull `@expo/vector-icons` (untranspiled JSX, breaks web bundlers); excluded from the web barrel (`ui/index.web.ts`) and from this package's re-exports. Web nav needs `.web.tsx` icon-free variants (future work). |

The split is enforced by file resolution, not runtime branching: the integration
prepends `.web.*` to vite's resolve extensions, so for any `Foo.tsx` a sibling
`Foo.web.tsx` is picked on web. The web UI barrel (`@kbve/rn/ui` →
`ui/index.web.ts`) omits the nav barrel entirely.

## Requirements

Peer deps in the consuming app: `astro`, `react`, `react-dom`,
`react-native-web`. `@kbve/core` logic is platform-agnostic and already runs on
the web; only the view layer needs the alias.
