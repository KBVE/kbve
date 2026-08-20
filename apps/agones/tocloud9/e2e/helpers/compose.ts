import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..');
const composeFile = path.join(projectRoot, 'docker-compose.yml');
const dotEnv = path.join(projectRoot, '.env');
const envFile =
	process.env.TC9_ENV_FILE ??
	(fs.existsSync(dotEnv) ? dotEnv : path.join(projectRoot, '.env.example'));

export function compose(...args: string[]): string {
	return execFileSync(
		'docker',
		['compose', '-f', composeFile, '--env-file', envFile, ...args],
		{
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
}

export function redisKeys(pattern: string): string[] {
	return compose(
		'exec',
		'-T',
		'redis',
		'redis-cli',
		'--no-raw',
		'KEYS',
		pattern,
	)
		.split('\n')
		.map((line) =>
			line
				.replace(/^\s*\d+\)\s*/, '')
				.replace(/^"|"$/g, '')
				.trim(),
		)
		.filter(Boolean);
}

export function redisGet(key: string): string {
	return compose(
		'exec',
		'-T',
		'redis',
		'redis-cli',
		'--raw',
		'GET',
		key,
	).trim();
}
