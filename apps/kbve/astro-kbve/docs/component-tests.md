# React Component Unit Tests (jsdom + testing-library)

Pattern for unit-testing a `.tsx` component in `apps/kbve/astro-kbve`.

## Layout

- Config: `vitest.unit-jsdom.config.ts`
- Setup: `vitest.unit-jsdom.setup.ts` (jest-dom matchers + auto cleanup)
- File naming: `<Component>.unit.test.tsx` — the suffix matters; `vitest.config.ts` matches `*.test.ts(x)` but skips `*.unit.test.tsx`, and `vitest.unit-jsdom.config.ts` only matches `*.unit.test.tsx`. The two suites can run on different `environment`s without colliding.
- Test colocated with the component (`src/components/dashboard/dashboard-ui.AuthGate.unit.test.tsx` lives next to `dashboard-ui.tsx`).

## Run

```sh
./kbve.sh -nx astro-kbve:test:unit       # jsdom unit tests
./kbve.sh -nx astro-kbve:test            # node-env vitest (existing)
```

Or directly:

```sh
cd apps/kbve/astro-kbve
pnpm exec vitest run --config vitest.unit-jsdom.config.ts
```

## Seed example (copy-pasta)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { atom } from 'nanostores';
import { AuthGate } from './dashboard-ui';

it('renders sign-in branch when authState is "unauthenticated"', () => {
	const $authState = atom<
		'loading' | 'authenticated' | 'unauthenticated' | 'forbidden'
	>('unauthenticated');
	render(
		<AuthGate $authState={$authState} initAuth={vi.fn()} serviceName="Argo">
			<div>child</div>
		</AuthGate>,
	);
	expect(screen.getByText(/Sign In Required/i)).toBeInTheDocument();
});
```

## What to assert

- Props → render: query by `role` / `text` / `testId`.
- Click → state: `userEvent.setup()` + click + assert callback / next render.
- Conditional branches: cover every `if`/`switch` arm in the component body — `StatusBadge` covers all six health colours, `AuthGate` covers all four auth states.
- Accessibility shape: structural assertions like `tagName === 'BUTTON'` and `aria-expanded` catch the `<div onClick>` class of regression that #11578 patched.

## What to skip

- Yuki / VRM components — Three.js + canvas mocks are their own scope (#11646 covers the smoke).
- Network: nanostore `services` that hit `fetch` should be tested at the service layer (#11594), not by rendering the React tree.
- ClientRouter / persist: e2e territory (#11583 tracker).
