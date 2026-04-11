import { waitForRcon } from './helpers/rcon';

export async function setup() {
	await waitForRcon();
}
