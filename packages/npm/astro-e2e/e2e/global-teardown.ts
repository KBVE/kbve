import { execSync } from 'node:child_process';

const PORTS = [4302, 4303, 4304];

export default function globalTeardown() {
	for (const port of PORTS) {
		try {
			const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' })
				.trim()
				.split('\n')
				.filter(Boolean);
			for (const pid of pids) {
				try {
					process.kill(Number(pid), 'SIGTERM');
				} catch {
					// already dead
				}
			}
		} catch {
			// no process on this port
		}
	}
}
