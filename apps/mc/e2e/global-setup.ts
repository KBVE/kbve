import { waitForRcon } from './helpers/rcon';

/**
 * Runs once before any test worker starts.
 * Waits for the MC server RCON to accept connections.
 */
export async function setup() {
	await waitForRcon();
}
