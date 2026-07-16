import { describe, it, expect, beforeAll } from 'vitest';
import { waitForRcon } from './helpers/rcon';
import { dockerExec } from './helpers/docker';

describe('OPAC airship claim access', () => {
	let authoritativeConfig = '';

	beforeAll(async () => {
		await waitForRcon();
		const files = dockerExec(
			"grep -rl hostileChunkProtectedEntityList /data --include=openpartiesandclaims-server.toml 2>/dev/null || true",
		)
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
		authoritativeConfig = files
			.map((f) => dockerExec(`cat ${JSON.stringify(f)}`))
			.join('\n');
	});

	it('OPAC generated its authoritative serverconfig', () => {
		expect(authoritativeConfig).toMatch(/friendlyChunkProtectedEntityList/);
	});

	it('immersive_aircraft is granted mount access inside claims', () => {
		expect(authoritativeConfig).toMatch(/immersive_aircraft/);
	});
});
