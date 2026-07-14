import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { OverlayHost, ToastViewport } from '@kbve/rn/ui';
import { DashboardShell } from '../layout/DashboardShell';
import { Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useStaffContext } from '../lib/staff';

// The dashboard is for vetted members AND staff.
//  - signed out                              → /login
//  - signed in, no capability and not staff  → /apply (form or pending status)
//  - signed in + (vetted OR staff)           → the dashboard
// Staff with no marketplace profile (e.g. an admin who only vets) must still
// reach the dashboard, so the gate also honors staff permissions. Redirecting
// reactively on sign-out lands "Sign out" back on /login.
export function DashboardPage() {
	const { signedIn, hasCapability, loading } = useAuth();
	const staff = useStaffContext();
	const navigate = useNavigate();

	// Wait for staff to resolve before judging capability, or a staff-only user
	// would be redirected during the staff_permissions RPC round-trip.
	const settling = loading || (signedIn && staff.loading);
	const allowed = hasCapability || staff.isStaff;

	useEffect(() => {
		if (settling) return;
		const go = (to: string) =>
			void Promise.resolve(navigate({ to })).catch(() => {});
		if (!signedIn) {
			go('/login');
		} else if (!allowed) {
			go('/apply');
		}
	}, [settling, signedIn, allowed, navigate]);

	if (settling || !signedIn || !allowed) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Spinner label="Loading…" />
			</div>
		);
	}

	return (
		<>
			<DashboardShell />
			<OverlayHost />
			<ToastViewport />
		</>
	);
}
