import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { atom } from 'nanostores';
import { AuthGate } from './dashboard-ui';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden';

function renderGate(state: AuthState) {
	const $authState = atom<AuthState>(state);
	const initAuth = vi.fn();
	const utils = render(
		<AuthGate
			$authState={$authState}
			initAuth={initAuth}
			serviceName="Argo">
			<div data-testid="children-tree">child-content</div>
		</AuthGate>,
	);
	return { ...utils, initAuth };
}

describe('AuthGate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders the spinner branch when authState is "loading"', () => {
		renderGate('loading');
		expect(screen.getByText(/Authenticating/i)).toBeInTheDocument();
		expect(screen.queryByTestId('children-tree')).not.toBeInTheDocument();
	});

	it('renders the sign-in branch when authState is "unauthenticated"', () => {
		renderGate('unauthenticated');
		expect(screen.getByText(/Sign In Required/i)).toBeInTheDocument();
		expect(screen.getByText(/Argo/)).toBeInTheDocument();
		expect(screen.queryByTestId('children-tree')).not.toBeInTheDocument();
	});

	it('renders the forbidden branch when authState is "forbidden"', () => {
		renderGate('forbidden');
		expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
		expect(screen.queryByTestId('children-tree')).not.toBeInTheDocument();
	});

	it('renders children when authState is "authenticated"', () => {
		renderGate('authenticated');
		expect(screen.getByTestId('children-tree')).toBeInTheDocument();
		expect(screen.getByText('child-content')).toBeInTheDocument();
	});

	it('fires initAuth() exactly once on mount', () => {
		const { initAuth } = renderGate('loading');
		expect(initAuth).toHaveBeenCalledTimes(1);
	});
});
