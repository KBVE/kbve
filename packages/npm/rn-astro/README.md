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
   (Text, Surface, Button, AppCard, CardList, MenuList, NavShell, Gradient, …).

## Usage

```js
// astro.config.mjs
import { kbveRnAstro } from '@kbve/rn-astro/integration';

export default defineConfig({
	integrations: [react(), kbveRnAstro()],
});
```

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

## Requirements

Peer deps in the consuming app: `astro`, `react`, `react-dom`,
`react-native-web`. `@kbve/core` logic is platform-agnostic and already runs on
the web; only the view layer needs the alias.
