# astro-kbve e2e

Playwright suite for the astro-kbve app. Runs against the static build under `dist/apps/astro-kbve/` via `python3 -m http.server`.

## Projects

| Project         | Device profile | Notes                     |
| --------------- | -------------- | ------------------------- |
| `chromium`      | Desktop Chrome | Default desktop coverage  |
| `webkit`        | Desktop Safari | UA-specific behaviors     |
| `mobile-chrome` | Pixel 7        | Touch + mobile viewport   |
| `mobile-safari` | iPhone 14      | Touch + iOS Safari quirks |

## Run

```sh
./kbve.sh -nx run astro-kbve:e2e
```

Or directly:

```sh
cd apps/kbve/astro-kbve
pnpm exec playwright test --config=playwright.config.ts
```

## Visual regression (`toHaveScreenshot`)

Baselines committed under `e2e/__screenshots__/<projectName>/<testFile>/<arg>.png`.

Threshold: `maxDiffPixelRatio: 0.02` (2%) — permissive on first land, tighten as flakes drop.

### Update baselines

After an intentional UI change:

```sh
cd apps/kbve/astro-kbve
pnpm exec playwright test --config=playwright.config.ts --update-snapshots
```

Then commit the regenerated PNGs under `e2e/__screenshots__/`.

For one project at a time:

```sh
pnpm exec playwright test --project=mobile-safari --update-snapshots
```

### CI rebase loop

If a PR breaks a screenshot, the CI run uploads a `playwright-report` artifact with the diff image. Two paths forward:

1. The change was unintentional — fix the regression in the PR.
2. The change was intentional — pull the PR branch, run `--update-snapshots`, commit the new PNGs.

## Auth-mock fixture

`e2e/fixtures/auth-mock.ts` seeds `localStorage['sb-auth-token']` with a synthetic Supabase session before page load, so dashboards that gate on `getSession()` render their authenticated state without hitting the real GoTrue.

```ts
import {
	test,
	expect,
	mockSupaSession,
	mockArgoApi,
} from './fixtures/auth-mock';

test('argo authenticated load', async ({ page }) => {
	await mockSupaSession(page, { staff: true });
	await mockArgoApi(page, [{ name: 'example-app' }]);
	await page.goto('/dashboard/argo/');
	// ...
});
```
