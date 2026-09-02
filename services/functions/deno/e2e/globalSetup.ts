import { waitForReady, warmRoutes } from './helpers/http';

const ROUTES_TO_WARM = [
	'/health',
	'/meme',
	'/discordsh',
	'/user-vault',
	'/guild-vault',
	'/vault-reader',
	'/argo',
	'/logs',
	'/ows',
	'/forum',
	'/mc',
	'/irc',
	'/gh-webhook',
	'/gh-backfill',
	'/gh-admin',
	'/discord-bootstrap',
	'/discord-bot',
];

export async function setup() {
	await waitForReady();
	await warmRoutes(ROUTES_TO_WARM);
}
