# Astro-shell + nanostore controller

Reusable pattern for dashboard cards: render the static chrome as server HTML in
Astro, drive the few dynamic slots imperatively from a thin React island. No
vDOM tree for the static structure.

## Pieces

- **`@kbve/astro/components/StepCard.astro`** — the static card shell. Renders
  the border, numbered badge, title, and a status pill, wrapped in
  `[data-stepcard-root]`. The palette is pure CSS keyed off `data-status`
  (`todo` / `pending` / `done`) — switching status is a single attribute write,
  no per-node style patching. Body content comes through `<slot/>`.

- **`useStepCardStatus(status, disabled?)`** — the controller hook. Returns a
  ref; attach it to a hidden anchor inside the card body. On status change it
  walks `closest('[data-stepcard-root]')` (scoped — no global ids, safe with
  multiple cards on a page) and writes `data-status` / `data-disabled` + the
  pill text. CSS does the rest.

## Usage

```astro
---
import { StepCard } from '@kbve/astro/components/StepCard.astro';
import ReactStep1 from './ReactStep1';
---

<StepCard n={1} title="HMAC webhook secret">
	<ReactStep1 client:only="react" />
</StepCard>
```

```tsx
function ReactStep1() {
  const agents = useAgents();
  const stored = /* derived from a nanostore */;
  const anchor = useStepCardStatus(stored ? 'done' : 'todo');
  return (
    <>
      <span ref={anchor} hidden aria-hidden="true" />
      {/* dynamic body controls */}
    </>
  );
}
```

The static structure (border, badge, title, layout, status colors) ships as
HTML+CSS with zero hydration cost; React only owns the interactive body.
