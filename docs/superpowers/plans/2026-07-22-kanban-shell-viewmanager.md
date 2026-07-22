# Kanban Dashboard Shell + View Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/dashboard/kanban/` render inside the dashboard bento shell (rail + breadcrumb visible) as native stacked scroll, with GSAP-ScrollTrigger-driven reveal + mount/unmount view management for the D3 chart islands.

**Architecture:** Strip the `position:fixed` fullpage-snap overlay and GSAP `Observer` wheel-hijack from `AstroKanbanDashboard.astro`; sections become normal-flow bento bands inside `dash-main`. A new `kanbanViewManager.ts` registers one ScrollTrigger per section: reveal-on-enter + publishes a live-set (±2 sections) to `html[data-live-sections]`. `useKanbanSection` changes from latch-forever to live-set membership, so charts mount when near and unmount when >2 sections away.

**Tech Stack:** Astro (Starlight SSG), GSAP + ScrollTrigger, React 18 islands, D3 (d3-shape/d3-scale/etc), pnpm/nx.

## Global Constraints

- Build only via `pnpm nx run astro-kbve:build` — never bare `astro build`.
- Stale content cache: if shell/frontmatter renders stale, `rm -rf apps/kbve/astro-kbve/.astro node_modules/.vite` before rebuild.
- Do NOT modify `MarkdownContent.astro` — its `isDashboard` branch already supplies the shell for `/dashboard/kanban/`.
- Do NOT modify the data pipeline (`nx-kanban.json`, `/data/nx/nx-kanban.json`).
- No code comments beyond what already exists in-file (repo preference: minimal comments).
- Work in a git worktree; do not commit to `dev`/`main` directly.
- Base path for all files below: `apps/kbve/astro-kbve/src/components/dashboard/`.

---

### Task 1: De-fix the layout — stacked bento sections

Convert `AstroKanbanDashboard.astro` from fixed fullpage overlay to normal-flow section stack. Remove the Observer/fullpage GSAP script, dot-nav, and section-label. (View manager wired in Task 4.)

**Files:**

- Modify: `apps/kbve/astro-kbve/src/components/dashboard/AstroKanbanDashboard.astro`

**Interfaces:**

- Produces: `.kb-sections` container; `.kb-section[data-section={i}]` bands (i = 0..9); each chart mount point retains `sectionIndex` prop. Consumed by Task 4's view manager.

- [ ] **Step 1: Remove the GSAP Observer `<script>` block entirely**

Delete the whole `<!-- GSAP Section Controller -->` `<script>…</script>` block (the `import gsap … initKanbanSections … astro:page-load` block). Task 4 replaces it.

- [ ] **Step 2: Remove dot-nav + section-label markup**

Delete the `<nav class="kb-dot-nav">…</nav>` block and the `<div id="kb-section-label">…</div>` block from the template. Delete the `sectionNames` const if now unused in the frontmatter (it is only used by those two blocks and the deleted script — remove it).

- [ ] **Step 3: Rewrite the container + section wrappers**

Replace the outer `<div id="kb-snap-container" class="kb-snap-container not-content">` with `<div class="kb-sections not-content">`. For every section, collapse the triple wrapper:

Before:

```html
<section class="kb-section" data-section="1">
	<div class="kb-section-outer">
		<div class="kb-section-inner">
			<div class="kb-section-content kb-chart-center">
				<ReactKanbanDonut client:only="react" sectionIndex="{1}" />
			</div>
		</div>
	</div>
</section>
```

After:

```html
<section class="kb-section" data-section="1">
	<div class="kb-section-content kb-chart-center">
		<ReactKanbanDonut client:only="react" sectionIndex="{1}" />
	</div>
</section>
```

Apply to all 10 sections (0..9). Keep the inner `kb-section-content` + its modifier classes (`kb-chart-center`, `kb-board-section`, `kb-browser-section`) and all existing content markup unchanged.

- [ ] **Step 4: Replace the layout CSS**

In the `<style>` block, delete these rules entirely: `.kb-snap-container`, `.kb-section` (the `position:absolute` version), `.kb-section[data-section='0']`, `.kb-section-outer`, `.kb-section-inner`, `.kb-dot-nav`, `.kb-dot`, `.kb-dot--active`, `.kb-dot-label`, `.kb-dot:hover .kb-dot-label`, `.kb-dot--active .kb-dot-label`, `.kb-section-label` and all `.kb-section-label-*` rules, `.kb-scroll-hint` + `@keyframes kb-bounce`.

Add:

```css
.kb-sections {
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
	width: 100%;
}
.kb-section {
	width: 100%;
	border-radius: 12px;
	border: 1px solid var(--sl-color-gray-5, #262626);
	background: var(--sl-color-bg-nav, #111);
	opacity: 0;
}
.kb-section-content {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	padding: 1.25rem 1.5rem;
	gap: 1rem;
	box-sizing: border-box;
}
.kb-chart-center {
	align-items: center;
}
```

Leave all the content-piece styles (`.kb-card`, `.kb-header-row`, `.kb-stat*`, `.kb-dist*`, `.kb-breakdown*`, `.kb-phase*`, `.kb-pipe*`, `.kb-label*`, `.kb-summary*`, `.kb-board-section`, `.kb-browser-section`, etc.) as-is.

- [ ] **Step 5: Remove the scroll-hint paragraph**

Delete `<p class="kb-scroll-hint">Scroll to explore visualizations ↓</p>` from the Summary section.

- [ ] **Step 6: Delete the `astro:page-load`-dependent progressive-enhancement note**

None needed — `.kb-section { opacity: 0 }` will be flipped to visible by the view manager; add a no-JS fallback in Task 4. For now, temporarily set `.kb-section { opacity: 1 }` so a build in this task renders visibly; Task 4 changes it back to `0` and adds the reveal.

- [ ] **Step 7: Build**

Run: `pnpm nx run astro-kbve:build`
Expected: build succeeds, no TS errors about removed `sectionNames`.

- [ ] **Step 8: Verify shell + no overlay in built HTML**

Run: `grep -c 'kb-snap-container\|kb-dot-nav\|position: fixed' dist/apps/astro-kbve/dashboard/kanban/index.html`
Expected: `0`.
Run: `grep -c 'dash-grid__rail\|dash-breadcrumb' dist/apps/astro-kbve/dashboard/kanban/index.html`
Expected: `>0` (rail + breadcrumb present, no longer covered).

- [ ] **Step 9: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/dashboard/AstroKanbanDashboard.astro
git commit -m "refactor(kanban): stacked bento sections, drop fixed fullpage overlay"
```

---

### Task 2: Live-set gate — rewrite `useKanbanSection`

Change the section gate from latch-forever to live-set membership so charts unmount when far.

**Files:**

- Modify: `apps/kbve/astro-kbve/src/components/dashboard/useKanbanSection.ts:9-37`

**Interfaces:**

- Produces: `useKanbanSection(sectionIndex: number): boolean` — returns `true` while `sectionIndex` ∈ the comma list in `document.documentElement.dataset.liveSections`, else `false`. Reacts to changes via MutationObserver on `data-live-sections`. Consumed by all `ReactKanban*` islands.

- [ ] **Step 1: Replace the hook body**

Replace lines 9-37 (`export function useKanbanSection …`) with:

```ts
export function useKanbanSection(sectionIndex: number): boolean {
	const [live, setLive] = useState(false);

	useEffect(() => {
		const read = () => {
			const attr =
				document.documentElement.getAttribute('data-live-sections') ??
				'';
			const set = attr
				.split(',')
				.map((s) => parseInt(s, 10))
				.filter((n) => !Number.isNaN(n));
			setLive(set.includes(sectionIndex));
		};

		read();

		const observer = new MutationObserver(read);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-live-sections'],
		});

		return () => observer.disconnect();
	}, [sectionIndex]);

	return live;
}
```

Update the JSDoc above it to describe live-set membership (replace the "stays true permanently" line). Keep `useState`/`useEffect` imports (already present).

- [ ] **Step 2: Typecheck**

Run: `pnpm nx run astro-kbve:build`
Expected: build succeeds (charts still consume the same `(number) => boolean` signature).

- [ ] **Step 3: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/dashboard/useKanbanSection.ts
git commit -m "feat(kanban): useKanbanSection tracks live-set membership (mount/unmount)"
```

---

### Task 3: Chart islands — unmount cleanup + skeleton

Make each D3 chart tear down on unmount and hold height with a skeleton. Same mechanical transform for the 7 chart islands.

**Files:**

- Modify: `ReactKanbanDonut.tsx`, `ReactKanbanTreemap.tsx`, `ReactKanbanTimeline.tsx`, `ReactKanbanSankey.tsx`, `ReactKanbanHeatmap.tsx`, `ReactKanbanBoard.tsx`, `ReactKanbanAssignees.tsx` (all under the dashboard base path)

**Interfaces:**

- Consumes: `useKanbanSection(sectionIndex)` (Task 2), `createChartTooltip` (returns `{ el: HTMLDivElement, … }`).

**Transform rules (apply to each of the 7 files):**

1. Remove the `const rendered = useRef(false);` line and every reference to `rendered.current` (both the `|| rendered.current` guard condition and the `rendered.current = true;` assignment).
2. In the draw `useEffect`, keep the guard `if (!active || !data || !svgRef.current || !wrapRef.current) return;` (drop only the `rendered.current` clause).
3. Capture the tooltip and svg in locals, and add a cleanup return that removes them so unmount frees the D3 DOM + tooltip node.
4. Gate the heavy DOM in render: when `!active`, render a skeleton box of the chart's natural height instead of the `<svg>`; keep the wrapper `<div ref={wrapRef}>` and `<h3>` title always mounted.

- [ ] **Step 1: Donut — apply the transform (reference implementation)**

In `ReactKanbanDonut.tsx`:

Remove `const rendered = useRef(false);` and its uses. Change the effect to add cleanup:

```tsx
useEffect(() => {
	if (!active || !data || !svgRef.current || !wrapRef.current) return;

	const tooltip = createChartTooltip(wrapRef.current, 'donut');
	const svg = svgRef.current;
	// … existing draw code, but reference `svg` local instead of svgRef.current …

	return () => {
		while (svg.firstChild) svg.removeChild(svg.firstChild);
		tooltip.el.remove();
	};
}, [active, data]);
```

Change the render to gate the svg:

```tsx
return (
	<div
		ref={wrapRef}
		style={{
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			gap: '1rem',
		}}>
		<h3
			style={{
				margin: 0,
				fontSize: '0.8rem',
				fontWeight: 600,
				textTransform: 'uppercase',
				letterSpacing: '0.05em',
				color: 'var(--sl-color-gray-3, #8b949e)',
			}}>
			Column Distribution
		</h3>
		{active ? (
			<svg
				ref={svgRef}
				width={420}
				height={420}
				viewBox="0 0 420 420"
				style={{ maxWidth: '100%', height: 'auto' }}
			/>
		) : (
			<div
				style={{
					width: '100%',
					maxWidth: 420,
					aspectRatio: '1 / 1',
					borderRadius: 12,
					background: 'var(--sl-color-gray-6, #1a1a1a)',
				}}
			/>
		)}
	</div>
);
```

- [ ] **Step 2: Apply the same transform to the other 6 charts**

For `ReactKanbanTreemap.tsx`, `ReactKanbanTimeline.tsx`, `ReactKanbanSankey.tsx`, `ReactKanbanHeatmap.tsx`, `ReactKanbanBoard.tsx`, `ReactKanbanAssignees.tsx`:

- Remove `rendered` ref + uses.
- Add the `return () => { clear svg children; tooltip.el.remove(); }` cleanup to the draw effect (adapt the svg-clear to whatever container each uses — if a chart draws into a `<div>` container instead of `<svg>`, clear that node's children: `while (node.firstChild) node.removeChild(node.firstChild);`).
- Gate the chart node behind `active ? <chart/> : <skeleton/>`, where the skeleton is a `<div>` with the same width/aspect as the mounted chart (match the chart's `width`/`height`/`viewBox` — use `aspectRatio` derived from those, `background: 'var(--sl-color-gray-6, #1a1a1a)'`, `borderRadius: 12`).
- If a chart has no tooltip (`createChartTooltip` not used), omit the `tooltip.el.remove()` line.

- [ ] **Step 3: Build**

Run: `pnpm nx run astro-kbve:build`
Expected: build succeeds, no unused-var errors for removed `rendered`.

- [ ] **Step 4: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/dashboard/ReactKanban*.tsx
git commit -m "feat(kanban): charts teardown D3 on unmount + height-preserving skeleton"
```

---

### Task 4: View manager — ScrollTrigger reveal + live-set

New module driving reveal animation and the ±2 live-set. Wire it into the Astro script with `astro:page-load` init + `onSwap` teardown.

**Files:**

- Create: `apps/kbve/astro-kbve/src/components/dashboard/kanbanViewManager.ts`
- Modify: `apps/kbve/astro-kbve/src/components/dashboard/AstroKanbanDashboard.astro` (add script block + set `.kb-section{opacity:0}`)

**Interfaces:**

- Produces: `initKanbanViewManager(): () => void` — registers ScrollTriggers, returns a teardown fn. Writes `document.documentElement.dataset.liveSections`. Consumed by the Astro `<script>`.

- [ ] **Step 1: Write the view manager module**

Create `kanbanViewManager.ts`:

```ts
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const KEEP_WARM = 2;

export function initKanbanViewManager(): () => void {
	const sections = Array.from(
		document.querySelectorAll<HTMLElement>('.kb-section'),
	);
	if (sections.length === 0) return () => {};

	const total = sections.length;
	let centered = -1;

	const publishLive = (center: number) => {
		if (center === centered) return;
		centered = center;
		const live: number[] = [];
		for (let i = 0; i < total; i++) {
			if (Math.abs(i - center) <= KEEP_WARM) live.push(i);
		}
		document.documentElement.dataset.liveSections = live.join(',');
	};

	const reveal = (el: HTMLElement) =>
		gsap.to(el, {
			opacity: 1,
			y: 0,
			duration: 0.5,
			ease: 'power1.out',
			overwrite: 'auto',
		});

	gsap.set(sections, { y: 12 });

	const triggers = sections.map((section, i) =>
		ScrollTrigger.create({
			trigger: section,
			start: 'top 85%',
			end: 'bottom 15%',
			onEnter: () => reveal(section),
			onEnterBack: () => reveal(section),
			onToggle: (self) => {
				if (self.isActive) publishLive(i);
			},
		}),
	);

	// Seed the initial live-set from whichever section is nearest the top.
	const firstActive = triggers.findIndex((t) => t.isActive);
	publishLive(firstActive >= 0 ? firstActive : 0);
	ScrollTrigger.refresh();

	return () => {
		triggers.forEach((t) => t.kill());
		delete document.documentElement.dataset.liveSections;
	};
}
```

- [ ] **Step 2: Wire the Astro script + reveal base state**

In `AstroKanbanDashboard.astro`, set `.kb-section { opacity: 0 }` in the style block (revert the Task 1 Step 6 temporary `opacity:1`). Add a new script block at the end of the file:

```astro
<script>
	import { initKanbanViewManager } from './kanbanViewManager';
	import { onSwap } from '@kbve/astro/utils/clientRouter';

	let teardown: (() => void) | null = null;

	document.addEventListener('astro:page-load', () => {
		teardown?.();
		teardown = initKanbanViewManager();
	});

	onSwap(() => {
		teardown?.();
		teardown = null;
	});
</script>
```

- [ ] **Step 3: No-JS fallback**

Add to the style block so sections are visible if JS never runs:

```css
@media (scripting: none) {
	.kb-section {
		opacity: 1;
	}
}
```

- [ ] **Step 4: Build**

Run: `pnpm nx run astro-kbve:build`
Expected: build succeeds; `gsap/ScrollTrigger` resolves.

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/dashboard/kanbanViewManager.ts apps/kbve/astro-kbve/src/components/dashboard/AstroKanbanDashboard.astro
git commit -m "feat(kanban): ScrollTrigger view manager — reveal + ±2 live-set"
```

---

### Task 5: Gate the Browser island + carry over mobile rules

Bring section 9 (Browser) into the live-set and preserve the mobile chart-hiding rules under the new layout.

**Files:**

- Modify: `apps/kbve/astro-kbve/src/components/dashboard/AstroKanbanDashboard.astro`
- Modify: `apps/kbve/astro-kbve/src/components/dashboard/ReactKanbanBrowser.tsx`

- [ ] **Step 1: Pass `sectionIndex` to Browser**

In `AstroKanbanDashboard.astro`, change `<ReactKanbanBrowser client:only="react" />` to `<ReactKanbanBrowser client:only="react" sectionIndex={9} />`.

- [ ] **Step 2: Gate Browser on the live-set**

In `ReactKanbanBrowser.tsx`, add a `sectionIndex: number` prop, call `const active = useKanbanSection(sectionIndex);`, and render a skeleton (`<div>` min-height ~400px, `background: 'var(--sl-color-gray-6, #1a1a1a)'`, `borderRadius: 12`) when `!active`, the existing browser UI when `active`. If the browser holds heavy state/effects, guard them on `active` too.

- [ ] **Step 3: Carry over mobile rules**

In `AstroKanbanDashboard.astro` style block, confirm the `@media (max-width: 640px)` rules that hide Sankey/Heatmap still target `.kb-section[data-section='4']` / `[data-section='5']` (they do — `data-section` attributes are retained). Remove the now-defunct `.kb-dot-nav` / `.kb-section-label` selectors inside that media block. Keep `.kb-section-content` padding rule (drop the `var(--sl-nav-height…)` top padding that existed for the fixed overlay — with normal flow it is no longer needed; set to `padding: 1rem`).

- [ ] **Step 4: Build**

Run: `pnpm nx run astro-kbve:build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/dashboard/AstroKanbanDashboard.astro apps/kbve/astro-kbve/src/components/dashboard/ReactKanbanBrowser.tsx
git commit -m "feat(kanban): gate Browser island on live-set + carry mobile rules"
```

---

### Task 6: End-to-end verification

Drive the built page and confirm shell + view management behavior.

**Files:** none (verification only)

- [ ] **Step 1: Serve the built site**

Run: `pnpm nx run astro-kbve:preview` (or serve `dist/apps/astro-kbve`) and open `/dashboard/kanban/`.

- [ ] **Step 2: Shell present, no overlay**

Confirm rail + breadcrumb visible beside content; page scrolls natively; `document.body.style.overflow` is `''` (not `hidden`); no full-viewport fixed layer.

- [ ] **Step 3: Reveal**

Scroll down — each section fades/slides in on first entry.

- [ ] **Step 4: Mount within band**

In devtools, watch `document.documentElement.dataset.liveSections`. It updates as you scroll; charts within ±2 of the active section have their `<svg>`/chart node in the DOM.

- [ ] **Step 5: Unmount far**

Scroll so a chart is >2 sections away → its chart node is replaced by the skeleton `<div>` (verify node removed in Elements panel); no scroll-jump when it swaps.

- [ ] **Step 6: Re-entry**

Scroll back → chart re-renders correctly.

- [ ] **Step 7: Navigation cleanup**

In console run `ScrollTrigger.getAll().length` after navigating away (ClientRouter) and back — no growth/duplicates. `data-live-sections` absent after teardown, re-seeded after return.

- [ ] **Step 8: Mobile**

Narrow to <640px: sections stack + scroll; Sankey (4) + Heatmap (5) hidden.

- [ ] **Step 9: No-JS**

Disable JS, reload: Summary (static) visible; sections not stuck at `opacity:0`.

- [ ] **Step 10: Finish the branch**

Invoke superpowers:finishing-a-development-branch to open the PR.
