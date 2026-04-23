import { useEffect, useState } from 'react';
import { authBridge, initSupa } from '@/lib/supa';
import type { Session } from '@supabase/supabase-js';

export default function ReactProfileCard() {
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		initSupa()
			.then(() => authBridge.getSession())
			.then((s) => setSession(s))
			.catch(() => setSession(null))
			.finally(() => setLoading(false));
	}, []);

	if (loading) {
		return (
			<div className="ri-auth-status">
				<div className="ri-spinner"></div>
				<div className="ri-status-message">Loading profile...</div>
			</div>
		);
	}

	if (!session?.user) {
		return (
			<div className="ri-profile-guest">
				<p>You are not signed in.</p>
				<a href="/auth/login/" className="ri-profile-signin-btn">
					Sign In
				</a>
			</div>
		);
	}

	const user = session.user;
	const name =
		user.user_metadata?.full_name ||
		user.user_metadata?.name ||
		user.email?.split('@')[0] ||
		'Adventurer';
	const avatar = user.user_metadata?.avatar_url;
	const provider = user.app_metadata?.provider || 'unknown';

	return (
		<>
			<div className="ri-profile__header">
				{avatar && (
					<img
						src={avatar}
						alt={name}
						className="ri-profile__avatar"
					/>
				)}
				<div className="ri-profile__info">
					<h2 className="ri-profile__name">{name}</h2>
					<span className="ri-profile__provider">via {provider}</span>
					{user.email && (
						<span className="ri-profile__email">{user.email}</span>
					)}
				</div>
			</div>

			<div className="ri-profile__actions">
				<a href="/auth/logout/" className="ri-profile-signout-btn">
					Sign Out
				</a>
			</div>
		</>
	);
}
