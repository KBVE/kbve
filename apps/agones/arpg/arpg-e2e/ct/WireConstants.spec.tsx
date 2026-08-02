import { test, expect } from '@playwright/experimental-ct-react';
import { EPHEMERAL_PET_ROSTER, EPHEMERAL_PET_NOTICE } from '@kbve/laser/wire';

// Guards the `@kbve/laser/wire` path mapping in tsconfig.json, not the constants
// themselves (postcard-wire.spec.ts in laser covers those).
//
// Spec files are evaluated in Node, which cannot resolve `@kbve/laser` — the ct vite alias
// only applies to the browser bundle. Without the mapping, a value import here fails the
// whole file with a bare `Cannot find module`, which reads nothing like the real cause.
// Type-only imports are unaffected either way, since they are erased before Node sees them.
test('wire constants are value-importable from a spec', async () => {
	expect(EPHEMERAL_PET_ROSTER).toBe(17);
	expect(EPHEMERAL_PET_NOTICE).toBe(22);
});
