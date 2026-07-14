import { atom } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';
import {
	parseErrorGroups,
	parseErrorEvents,
	type ErrorGroup,
	type ErrorEvent,
} from '@kbve/devops/telemetry';

export type AuthState =
	| 'loading'
	| 'authenticated'
	| 'unauthenticated'
	| 'forbidden';

const METRICS_BASE = 'https://metrics.kbve.com';
const REQUEST_TIMEOUT_MS = 15000;

class TelemetryService {
	public readonly $authState = atom<AuthState>('loading');
	private readonly $accessToken = atom<string | null>(null);

	public readonly $groups = atom<ErrorGroup[]>([]);
	public readonly $groupsLoading = atom<boolean>(false);
	public readonly $error = atom<string | null>(null);
	public readonly $project = atom<string>('');

	public readonly $selected = atom<string | null>(null);
	public readonly $events = atom<ErrorEvent[]>([]);
	public readonly $eventsLoading = atom<boolean>(false);

	public async initAuth(): Promise<void> {
		try {
			await initSupa();
			const supa = getSupa();
			const sessionResult = await supa.getSession().catch(() => null);
			const session = sessionResult?.session ?? null;
			if (!session?.access_token) {
				this.$authState.set('unauthenticated');
				return;
			}
			this.$accessToken.set(session.access_token as string);
			this.$authState.set('authenticated');
			void this.loadGroups();
		} catch {
			this.$authState.set('unauthenticated');
		}
	}

	private authHeaders(): Record<string, string> | null {
		const token = this.$accessToken.get();
		if (!token) return null;
		return { Authorization: `Bearer ${token}` };
	}

	public async loadGroups(): Promise<void> {
		const headers = this.authHeaders();
		if (!headers) return;
		this.$groupsLoading.set(true);
		this.$error.set(null);
		try {
			const qs = new URLSearchParams({ limit: '100' });
			const project = this.$project.get().trim();
			if (project) qs.set('project', project);
			const resp = await fetch(`${METRICS_BASE}/api/v1/groups?${qs}`, {
				headers,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			if (resp.status === 403) {
				this.$authState.set('forbidden');
				return;
			}
			if (!resp.ok) {
				this.$error.set(`groups request failed (${resp.status})`);
				return;
			}
			const data = await resp.json();
			this.$groups.set(parseErrorGroups(data.groups ?? []));
		} catch (err) {
			this.$error.set(
				err instanceof Error ? err.message : 'network error',
			);
		} finally {
			this.$groupsLoading.set(false);
		}
	}

	public async drill(fingerprint: string): Promise<void> {
		this.$selected.set(fingerprint);
		const headers = this.authHeaders();
		if (!headers) return;
		this.$eventsLoading.set(true);
		this.$error.set(null);
		try {
			const qs = new URLSearchParams({ fingerprint, limit: '50' });
			const project = this.$project.get().trim();
			if (project) qs.set('project', project);
			const resp = await fetch(`${METRICS_BASE}/api/v1/events?${qs}`, {
				headers,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			if (resp.status === 403) {
				this.$authState.set('forbidden');
				return;
			}
			if (!resp.ok) {
				this.$error.set(`events request failed (${resp.status})`);
				return;
			}
			const data = await resp.json();
			this.$events.set(parseErrorEvents(data.events ?? []));
		} catch (err) {
			this.$error.set(
				err instanceof Error ? err.message : 'network error',
			);
		} finally {
			this.$eventsLoading.set(false);
		}
	}

	public setProject(project: string): void {
		this.$project.set(project);
	}

	public clearSelection(): void {
		this.$selected.set(null);
		this.$events.set([]);
	}
}

export const telemetryService = new TelemetryService();
