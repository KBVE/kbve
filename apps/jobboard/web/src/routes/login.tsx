import { useEffect } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { SetUsernameScreen, useAuth as useKbveAuth } from '@kbve/rn/auth';
import { LoginForm } from '../components/LoginForm';

// Split-screen auth: the shared @kbve/rn LoginScreen (email/pw + Discord/GitHub/
// Twitch OAuth + hCaptcha) on the left, artwork on the right. Browsing is public —
// this page is only reached via the "Log in" button or a gated action.
export function LoginPage() {
	const auth = useKbveAuth();
	const navigate = useNavigate();

	// Once fully signed in (and past the username step), return to the marketplace.
	useEffect(() => {
		if (auth.signedIn && !auth.needsUsername) {
			navigate({ to: '/' });
		}
	}, [auth.signedIn, auth.needsUsername, navigate]);

	const needsUsername = auth.signedIn && auth.needsUsername;

	return (
		<div className="grid min-h-screen lg:grid-cols-2">
			{/* Left — the form */}
			<div className="relative flex min-h-screen flex-col items-center justify-center p-6">
				<Link
					to="/"
					className="absolute left-5 top-5 z-10 text-sm text-zinc-400 transition hover:text-gold-300">
					← Back to browsing
				</Link>
				<div className="w-full max-w-sm">
					{needsUsername ? <SetUsernameScreen /> : <LoginForm />}
				</div>
			</div>

			{/* Right — artwork (hidden on small screens so the form is full-width) */}
			<aside className="relative hidden overflow-hidden lg:block">
				<img
					src="https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1600&q=70"
					alt=""
					className="absolute inset-0 h-full w-full object-cover"
				/>
				<div className="absolute inset-0 bg-linear-to-tr from-[#121312] via-quest-900/50 to-gold-600/25" />
				<div className="relative flex h-full flex-col justify-end gap-3 p-12">
					<span className="inline-flex w-fit items-center gap-2 rounded-full border border-gold-400/40 bg-black/40 px-3 py-1 text-xs font-medium text-gold-300">
						✦ KBVE Jobs
					</span>
					<blockquote className="font-display text-4xl font-bold leading-tight text-zinc-50">
						Where games
						<br />
						get made.
					</blockquote>
					<p className="max-w-sm text-zinc-300">
						Curated gigs. Vetted talent. Hired by your work, not your résumé —
						join when you're ready, browse freely until then.
					</p>
				</div>
			</aside>
		</div>
	);
}
