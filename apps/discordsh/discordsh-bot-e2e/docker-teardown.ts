import { execSync } from 'child_process';

export default function globalTeardown() {
	try {
		execSync('docker rm -f discordsh-bot-e2e-test 2>/dev/null', {
			stdio: 'ignore',
		});
	} catch {
		// Container may already be stopped
	}
}
