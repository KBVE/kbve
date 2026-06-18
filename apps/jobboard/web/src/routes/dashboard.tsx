import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { DashboardShell } from '../layout/DashboardShell';
import { Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';

// The dashboard is for vetted members.
//  - signed out                          → /login
//  - signed in, un-vetted (no capability) → /apply (form or pending status)
//  - signed in + vetted                   → the dashboard
// Redirecting reactively on sign-out means "Sign out" from the dashboard lands
// the user back on /login.
export function DashboardPage() {
	const { signedIn, hasCapability, loading } = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		if (loading) return;
		const go = (to: string) =>
			void Promise.resolve(navigate({ to })).catch(() => {});
		if (!signedIn) {
			go('/login');
		} else if (!hasCapability) {
			go('/apply');
		}
	}, [loading, signedIn, hasCapability, navigate]);

	if (loading || !signedIn || !hasCapability) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Spinner label="Loading…" />
			</div>
		);
	}

	return <DashboardShell />;
}
