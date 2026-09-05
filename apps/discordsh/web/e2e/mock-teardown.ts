import { execSync } from 'child_process';
import { resolve } from 'path';

export default function globalTeardown() {
	const workspaceRoot = resolve(__dirname, '../../../..');
	const composePath = 'apps/discordsh/web/e2e/mock/docker-compose.yaml';

	try {
		execSync(`docker compose -f ${composePath} down --remove-orphans`, {
			cwd: workspaceRoot,
			stdio: 'inherit',
			timeout: 30_000,
		});
	} catch {
		// Best-effort cleanup — don't fail the test run
	}
}
