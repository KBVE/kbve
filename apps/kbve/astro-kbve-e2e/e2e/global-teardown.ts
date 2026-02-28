import type { FullConfig } from '@playwright/test';

async function globalTeardown(_config: FullConfig) {
	// Cleanup after test runs if needed
}

export default globalTeardown;
