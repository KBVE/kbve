import { waitForReady } from './helpers/http';

/**
 * Runs once before any test worker starts. Ensures the firecracker-ctl
 * container is accepting HTTP requests so per-file beforeAll() polls
 * resolve immediately.
 */
export async function setup() {
	await waitForReady();
}
