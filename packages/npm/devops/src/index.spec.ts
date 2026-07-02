import { describe, it, expect } from 'vitest';
import * as devops from './index';

describe('index.ts entrypoint exports (v0.0.21 smoke test)', () => {
	it('exports withGitHubRetry as a function', () => {
		expect(typeof devops.withGitHubRetry).toBe('function');
	});

	it('exports findActionInTitleSafe as a function', () => {
		expect(typeof devops.findActionInTitleSafe).toBe('function');
	});

	it('exports buildDispatchManifestSafe as a function', () => {
		expect(typeof devops.buildDispatchManifestSafe).toBe('function');
	});

	it('exports buildDispatchManifest as a function', () => {
		expect(typeof devops.buildDispatchManifest).toBe('function');
	});

	it('exports ci.classifyAll as a function via the ci namespace', () => {
		expect(typeof devops.ci).toBe('object');
		expect(typeof devops.ci.classifyAll).toBe('function');
	});
});
