# @kbve/astro

Unified Astro component library with React support and `@kbve/droid` integration.

## Installation

```bash
npm install @kbve/astro @kbve/droid
```

## Usage

### React hooks

```tsx
import { useDroid, useDroidEvents } from '@kbve/astro';

function MyComponent() {
	const { initialized, hasApi, hasEvents, error } = useDroid();

	useDroidEvents('droid-ready', (payload) => {
		console.log('Droid ready at', payload.timestamp);
	});

	if (!initialized) return <div>Loading workers...</div>;
	return <div>Workers ready!</div>;
}
```

### Astro components

```astro
---
import DroidProvider from '@kbve/astro/components/DroidProvider.astro';
import DroidStatus from '@kbve/astro/components/DroidStatus.astro';
---

<DroidProvider>
	<DroidStatus />
	<slot />
</DroidProvider>
```

### Ruffle

```astro
---
import AstroRuffle from '@kbve/astro/components/ruffle/AstroRuffle.astro';
---

<AstroRuffle
	src="/swf/game.swf"
	height={540}
	config={{ autoplay: 'on', splashScreen: false }}
/>
```

`AstroRuffle` loads Ruffle from `https://unpkg.com/@ruffle-rs/ruffle` by
default. Use `cdn="jsdelivr"`, `version="..."`, or `scriptUrl="..."` when a
page needs a pinned or custom CDN endpoint.
