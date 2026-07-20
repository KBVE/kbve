import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { StoreAdminView } from '../StoreAdminView';

beforeEach(() => {
	global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
});

describe('StoreAdminView', () => {
	it('prompts sign-in when unauthenticated', () => {
		const { getByText } = render(
			<StoreAdminView getToken={async () => null} baseUrl="" authenticated={false} />,
		);
		expect(getByText(/Sign in as staff/)).toBeTruthy();
	});

	it('renders admin panels when authenticated', async () => {
		const { findByText } = render(
			<StoreAdminView getToken={async () => 'tok'} baseUrl="" authenticated />,
		);
		expect(await findByText(/Save product/)).toBeTruthy();
		expect(await findByText(/Order queue|Orders/)).toBeTruthy();
	});
});
