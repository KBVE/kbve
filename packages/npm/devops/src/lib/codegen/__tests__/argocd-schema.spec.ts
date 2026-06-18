import { describe, it, expect } from 'vitest';
import {
	ApplicationListSchema,
	ApplicationSchema,
	ArgoHealthCheckSchema,
	HealthStatusCodes,
	SyncStatusCodes,
} from '../../../../../../data/codegen/generated/argocd-schema';

describe('argocd generated schema', () => {
	const app = {
		name: 'cryptothrone',
		namespace: 'argocd',
		project: 'default',
		health: { status: 'Healthy', message: '' },
		sync: { status: 'Synced', revision: 'abc123' },
		repo_url: 'https://github.com/KBVE/kbve',
		target_revision: 'main',
		path: 'apps/kube/cryptothrone',
		created_at: '2026-06-18T00:00:00Z',
	};

	it('parses a normalized ArgoCD application', () => {
		expect(ApplicationSchema.parse(app)).toMatchObject({
			name: 'cryptothrone',
			health: { status: 'Healthy' },
			sync: { status: 'Synced' },
		});
	});

	it('parses an application list and strips unknown ArgoCD noise', () => {
		const list = ApplicationListSchema.parse({
			items: [{ ...app, operationState: { phase: 'Succeeded' } }],
		});
		expect(list.items).toHaveLength(1);
		expect(list.items?.[0]).not.toHaveProperty('operationState');
	});

	it('rejects an empty application name', () => {
		expect(ApplicationSchema.safeParse({ ...app, name: '' }).success).toBe(
			false,
		);
	});

	it('rejects health/sync values outside the ArgoCD enums', () => {
		expect(
			ApplicationSchema.safeParse({
				...app,
				health: { status: 'NotAStatus', message: '' },
			}).success,
		).toBe(false);
		expect(
			ApplicationSchema.safeParse({
				...app,
				sync: { status: 'Drifting', revision: '' },
			}).success,
		).toBe(false);
	});

	it('exposes the canonical ArgoCD enum string values', () => {
		expect(HealthStatusCodes).toEqual([
			'Healthy',
			'Degraded',
			'Progressing',
			'Suspended',
			'Missing',
			'Unknown',
		]);
		expect(SyncStatusCodes).toEqual(['Synced', 'OutOfSync', 'Unknown']);
	});

	it('validates an argo health check and rejects negative timings', () => {
		expect(
			ArgoHealthCheckSchema.parse({
				reachable: true,
				upstream_status: 200,
				elapsed_ms: 42,
				timestamp: '2026-06-18T00:00:00Z',
			}).reachable,
		).toBe(true);
		expect(
			ArgoHealthCheckSchema.safeParse({
				reachable: false,
				upstream_status: 0,
				elapsed_ms: -1,
				timestamp: '',
			}).success,
		).toBe(false);
	});
});
