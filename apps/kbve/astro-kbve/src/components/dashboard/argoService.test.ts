import { describe, it, expect, beforeEach } from 'vitest';
import {
	argoService,
	healthColor,
	syncColor,
	formatAge,
	detectAppStall,
	detectResourceStall,
	STALL_THRESHOLD_MS,
	type ArgoApplication,
	type ResourceNode,
	type ResourceSelector,
} from './argoService';

function makeApp(overrides: Partial<ArgoApplication> = {}): ArgoApplication {
	return {
		metadata: { name: 'demo-app', namespace: 'argocd' },
		spec: { project: 'default', source: { repoURL: '', path: '' } },
		status: {
			sync: { status: 'Synced', revision: 'abc' },
			health: { status: 'Healthy' },
			reconciledAt: new Date().toISOString(),
		},
		...overrides,
	} as ArgoApplication;
}

describe('argoService — healthColor', () => {
	it('returns green for Healthy', () => {
		expect(healthColor('Healthy')).toBe('#22c55e');
	});

	it('returns red for Degraded + Missing', () => {
		expect(healthColor('Degraded')).toBe('#ef4444');
		expect(healthColor('Missing')).toBe('#ef4444');
	});

	it('returns amber for Progressing', () => {
		expect(healthColor('Progressing')).toBe('#f59e0b');
	});

	it('returns grey for Suspended + unknown', () => {
		expect(healthColor('Suspended')).toBe('#6b7280');
		expect(healthColor('something-new')).toBe('#6b7280');
	});
});

describe('argoService — syncColor', () => {
	it('returns green for Synced', () => {
		expect(syncColor('Synced')).toBe('#22c55e');
	});

	it('returns amber for OutOfSync', () => {
		expect(syncColor('OutOfSync')).toBe('#f59e0b');
	});

	it('returns grey for unknown', () => {
		expect(syncColor('Unknown')).toBe('#6b7280');
		expect(syncColor('')).toBe('#6b7280');
	});
});

describe('argoService — formatAge', () => {
	it('seconds under 60s', () => {
		expect(formatAge(0)).toBe('0s');
		expect(formatAge(45_000)).toBe('45s');
	});

	it('minutes under 1h', () => {
		expect(formatAge(60_000)).toBe('1m');
		expect(formatAge(59 * 60_000)).toBe('59m');
	});

	it('hours under 1d', () => {
		expect(formatAge(60 * 60_000)).toBe('1h');
		expect(formatAge(23 * 3_600_000)).toBe('23h');
	});

	it('days', () => {
		expect(formatAge(24 * 3_600_000)).toBe('1d');
		expect(formatAge(7 * 86_400_000)).toBe('7d');
	});
});

describe('argoService — detectAppStall', () => {
	it('returns null when sync is Synced + health is Healthy', () => {
		expect(detectAppStall(makeApp())).toBeNull();
	});

	it('flags Sync running when operation Running > 5 min', () => {
		const startedAt = new Date(
			Date.now() - STALL_THRESHOLD_MS - 1_000,
		).toISOString();
		const stall = detectAppStall(
			makeApp({
				status: {
					sync: { status: 'Synced', revision: 'abc' },
					health: { status: 'Healthy' },
					operationState: { phase: 'Running', startedAt },
				},
			} as Partial<ArgoApplication>),
		);
		expect(stall?.reason).toBe('Sync running');
	});

	it('flags Progressing health when reconciled > 5 min ago', () => {
		const reconciledAt = new Date(
			Date.now() - STALL_THRESHOLD_MS - 1_000,
		).toISOString();
		const stall = detectAppStall(
			makeApp({
				status: {
					sync: { status: 'Synced', revision: 'abc' },
					health: { status: 'Progressing' },
					reconciledAt,
				},
			} as Partial<ArgoApplication>),
		);
		expect(stall?.reason).toBe('Progressing');
	});

	it('flags OutOfSync only after 30 min, not 5 min', () => {
		const shortAgo = new Date(Date.now() - 6 * 60_000).toISOString();
		const longAgo = new Date(Date.now() - 31 * 60_000).toISOString();
		const notStalled = detectAppStall(
			makeApp({
				status: {
					sync: { status: 'OutOfSync', revision: 'abc' },
					health: { status: 'Healthy' },
					reconciledAt: shortAgo,
				},
			} as Partial<ArgoApplication>),
		);
		expect(notStalled).toBeNull();

		const stalled = detectAppStall(
			makeApp({
				status: {
					sync: { status: 'OutOfSync', revision: 'abc' },
					health: { status: 'Healthy' },
					reconciledAt: longAgo,
				},
			} as Partial<ArgoApplication>),
		);
		expect(stalled?.reason).toBe('OutOfSync');
	});
});

describe('argoService — detectResourceStall', () => {
	it('flags Degraded immediately regardless of age', () => {
		const node = { health: { status: 'Degraded' } } as ResourceNode;
		expect(detectResourceStall(node)?.reason).toBe('Degraded');
	});

	it('flags Missing immediately', () => {
		const node = { health: { status: 'Missing' } } as ResourceNode;
		expect(detectResourceStall(node)?.reason).toBe('Missing');
	});

	it('flags Progressing only after 5 min', () => {
		const recent = {
			health: { status: 'Progressing' },
			createdAt: new Date().toISOString(),
		} as ResourceNode;
		expect(detectResourceStall(recent)).toBeNull();

		const stale = {
			health: { status: 'Progressing' },
			createdAt: new Date(
				Date.now() - STALL_THRESHOLD_MS - 1_000,
			).toISOString(),
		} as ResourceNode;
		expect(detectResourceStall(stale)?.reason).toBe('Progressing');
	});

	it('returns null for Healthy node', () => {
		const node = { health: { status: 'Healthy' } } as ResourceNode;
		expect(detectResourceStall(node)).toBeNull();
	});
});

describe('argoService — expand / select / tab atoms', () => {
	beforeEach(() => {
		argoService.$expandedApp.set(null);
		argoService.$selectedResource.set(null);
		argoService.$appTab.set('resources');
	});

	it('toggleExpandedApp expands when nothing is open', () => {
		argoService.toggleExpandedApp('app-a');
		expect(argoService.$expandedApp.get()).toBe('app-a');
		expect(argoService.$appTab.get()).toBe('resources');
		expect(argoService.$selectedResource.get()).toBeNull();
	});

	it('toggleExpandedApp collapses when called with the same name', () => {
		argoService.toggleExpandedApp('app-a');
		argoService.toggleExpandedApp('app-a');
		expect(argoService.$expandedApp.get()).toBeNull();
		expect(argoService.$selectedResource.get()).toBeNull();
	});

	it('toggleExpandedApp switches between apps + clears selection', () => {
		argoService.toggleExpandedApp('app-a');
		argoService.$selectedResource.set({
			appName: 'app-a',
			kind: 'Deployment',
			namespace: 'ns',
			name: 'd',
		} as ResourceSelector);
		argoService.toggleExpandedApp('app-b');
		expect(argoService.$expandedApp.get()).toBe('app-b');
		expect(argoService.$selectedResource.get()).toBeNull();
	});

	it('selectResource sets the selection', () => {
		const sel = {
			appName: 'app-a',
			kind: 'Pod',
			namespace: 'ns',
			name: 'p1',
		} as ResourceSelector;
		argoService.selectResource(sel);
		expect(argoService.$selectedResource.get()).toEqual(sel);
	});

	it('selectResource called twice with the same selection clears it', () => {
		const sel = {
			appName: 'app-a',
			kind: 'Pod',
			namespace: 'ns',
			name: 'p1',
		} as ResourceSelector;
		argoService.selectResource(sel);
		argoService.selectResource(sel);
		expect(argoService.$selectedResource.get()).toBeNull();
	});

	it('selectResource with a different selection replaces, not clears', () => {
		argoService.selectResource({
			appName: 'app-a',
			kind: 'Pod',
			namespace: 'ns',
			name: 'p1',
		} as ResourceSelector);
		const next = {
			appName: 'app-a',
			kind: 'Pod',
			namespace: 'ns',
			name: 'p2',
		} as ResourceSelector;
		argoService.selectResource(next);
		expect(argoService.$selectedResource.get()).toEqual(next);
	});

	it('setAppTab updates the atom', () => {
		argoService.setAppTab('events');
		expect(argoService.$appTab.get()).toBe('events');
		argoService.setAppTab('history');
		expect(argoService.$appTab.get()).toBe('history');
		argoService.setAppTab('resources');
		expect(argoService.$appTab.get()).toBe('resources');
	});
});
