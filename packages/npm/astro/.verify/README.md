# SiteGraph browser verify harness

Standalone Vite page that mounts the real `SiteGraph` React island (real
d3-force + real DOM paint) without booting the full Astro site, plus a
Playwright driver that exercises hover-dim, pan, and wheel-zoom.

```bash
# from packages/npm/astro
npx vite --config .verify/vite.config.mjs        # serves :4330
node .verify/drive.mjs                            # drives + asserts, writes shots
```

`drive.mjs` prints a JSON report and writes `shot-base.png` / `shot-hover.png`.
Artifacts (`*.png`, `*.log`) are gitignored — the harness source is kept for
future e2e runs.

`@kbve/droid` is stubbed (`droid-stub.ts`); only the graph is under test.
