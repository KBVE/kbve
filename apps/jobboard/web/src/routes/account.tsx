import { Link } from '@tanstack/react-router';
import { useAuth } from '@kbve/rn/auth';
import { Profile } from '../layout/Profile';

export function AccountPage() {
	const auth = useAuth();

	if (!auth.signedIn) {
		return (
			<div className="mx-auto max-w-2xl py-16 text-center">
				<p className="text-zinc-300">Sign in to view your account.</p>
				<Link
					to="/login"
					className="mt-3 inline-block font-semibold text-quest-300 transition hover:text-quest-200">
					Log in →
				</Link>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-2xl">
			<h1 className="mb-5 font-display text-2xl font-bold text-zinc-100">
				Account
			</h1>
			<Profile />
		</div>
	);
}
