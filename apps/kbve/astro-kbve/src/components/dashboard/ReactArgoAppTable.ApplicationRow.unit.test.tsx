import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ArgoApplication, ResourceSelector } from './argoService';
import { ApplicationRow } from './ReactArgoAppTable';

function buildApp(overrides: Partial<ArgoApplication> = {}): ArgoApplication {
	return {
		metadata: {
			name: 'app-alpha',
			namespace: 'argocd',
			creationTimestamp: '2026-06-01T00:00:00Z',
			...(overrides.metadata ?? {}),
		},
		spec: {
			project: 'platform',
			source: {
				repoURL: 'https://github.com/example/example.git',
				path: 'manifests',
				targetRevision: 'HEAD',
			},
			destination: {
				server: 'https://kubernetes.default.svc',
				namespace: 'default',
			},
			...(overrides.spec ?? {}),
		},
		status: {
			sync: { status: 'Synced' },
			health: { status: 'Healthy' },
			reconciledAt: '2026-06-01T00:01:00Z',
			...(overrides.status ?? {}),
		},
	} as ArgoApplication;
}

function renderRow(
	overrides: {
		app?: ArgoApplication;
		expanded?: boolean;
		onToggle?: () => void;
		tab?: 'resources' | 'events' | 'history';
		onTabChange?: (t: 'resources' | 'events' | 'history') => void;
		selectedResource?: ResourceSelector | null;
		onSelectResource?: (sel: ResourceSelector) => void;
	} = {},
) {
	const onToggle = overrides.onToggle ?? vi.fn();
	const onTabChange = overrides.onTabChange ?? vi.fn();
	const onSelectResource = overrides.onSelectResource ?? vi.fn();
	const utils = render(
		<ApplicationRow
			app={overrides.app ?? buildApp()}
			token="mock-token"
			expanded={overrides.expanded ?? false}
			onToggle={onToggle}
			tab={overrides.tab ?? 'resources'}
			onTabChange={onTabChange}
			selectedResource={overrides.selectedResource ?? null}
			onSelectResource={onSelectResource}
		/>,
	);
	return { ...utils, onToggle, onTabChange, onSelectResource };
}

describe('ApplicationRow', () => {
	it('renders the row as a <button> with aria-expanded="false" when collapsed', () => {
		renderRow({ expanded: false });
		const button = screen.getByRole('button', { name: /app-alpha/i });
		expect(button.tagName).toBe('BUTTON');
		expect(button).toHaveAttribute('aria-expanded', 'false');
		expect(button).toHaveClass('kbve-argo-row');
	});

	it('reflects expanded prop in aria-expanded', () => {
		renderRow({ expanded: true });
		const button = screen.getByRole('button', { name: /app-alpha/i });
		expect(button).toHaveAttribute('aria-expanded', 'true');
	});

	it('clicking the row invokes onToggle exactly once', async () => {
		const user = userEvent.setup();
		const { onToggle } = renderRow({ expanded: false });
		const button = screen.getByRole('button', { name: /app-alpha/i });
		await user.click(button);
		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it('renders the app name with the ellipsis-clamp style', () => {
		renderRow();
		const nameCell = screen.getByText('app-alpha');
		expect(nameCell).toBeInTheDocument();
		expect(nameCell.style.overflow).toBe('hidden');
		expect(nameCell.style.textOverflow).toBe('ellipsis');
		expect(nameCell.style.whiteSpace).toBe('nowrap');
	});

	it('shows the project column when present in the app spec', () => {
		renderRow({ app: buildApp({ spec: { project: 'platform' } as any }) });
		expect(screen.getByText('platform')).toBeInTheDocument();
	});

	it('renders sync + health status badges', () => {
		renderRow({
			app: buildApp({
				status: {
					sync: { status: 'OutOfSync' },
					health: { status: 'Degraded' },
				} as any,
			}),
		});
		expect(screen.getByText('OutOfSync')).toBeInTheDocument();
		expect(screen.getByText('Degraded')).toBeInTheDocument();
	});
});
