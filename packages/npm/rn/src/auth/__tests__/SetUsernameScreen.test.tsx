import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SetUsernameScreen } from '../SetUsernameScreen';

vi.mock('../useAuth', () => ({
	useAuth: () => ({
		status: 'signed_in',
		loading: false,
		signedIn: true,
		needsUsername: true,
		user: null,
		username: null,
		error: null,
	}),
	useAuthActions: () => ({
		signInWithPassword: vi.fn(),
		signUp: vi.fn(),
		signInWithOAuth: vi.fn(),
		setUsername: vi.fn(),
		signOut: vi.fn(),
	}),
}));

describe('SetUsernameScreen', () => {
	it('renders the provided title and pre-fills the suggestion', () => {
		render(
			<SetUsernameScreen
				title="Hey! We need you to create a username?"
				suggestion="octocat"
			/>,
		);
		expect(
			screen.getByText('Hey! We need you to create a username?'),
		).toBeTruthy();
		expect(screen.getByDisplayValue('octocat')).toBeTruthy();
	});
});
