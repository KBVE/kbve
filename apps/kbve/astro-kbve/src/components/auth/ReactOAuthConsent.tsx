import { useEffect, useState } from 'react';
import { authBridge } from '@/components/auth';
import { SUPABASE_URL } from '@/lib/supa';
import { cn } from '@/lib/utils';

const OAUTH_BASE = `${SUPABASE_URL}/auth/v1/oauth/authorizations`;

type Phase = 'loading' | 'consent' | 'working' | 'error';

const SCOPE_LABELS: Record<string, string> = {
	openid: 'Confirm your identity',
	email: 'Your email address',
	profile: 'Your basic profile',
	phone: 'Your phone number',
};

export default function ReactOAuthConsent() {
	const [phase, setPhase] = useState<Phase>('loading');
	const [message, setMessage] = useState('Loading authorization request...');
	const [subMessage, setSubMessage] = useState('Please wait');
	const [clientName, setClientName] = useState('an application');
	const [scopes, setScopes] = useState<string[]>([]);
	const [authId, setAuthId] = useState('');
	const [token, setToken] = useState('');

	useEffect(() => {
		const run = async () => {
			const id = new URLSearchParams(window.location.search).get(
				'authorization_id',
			);
			if (!id) {
				setPhase('error');
				setMessage('Invalid authorization request');
				setSubMessage('Missing authorization_id.');
				return;
			}
			setAuthId(id);

			let session = null;
			try {
				session = await authBridge.getSession();
			} catch {
				session = null;
			}
			if (!session?.access_token) {
				const here = window.location.pathname + window.location.search;
				window.location.href = `/login?redirect_to=${encodeURIComponent(
					`https://kbve.com${here}`,
				)}`;
				return;
			}
			setToken(session.access_token);

			const res = await fetch(`${OAUTH_BASE}/${id}`, {
				headers: { Authorization: `Bearer ${session.access_token}` },
			});
			if (!res.ok) {
				setPhase('error');
				setMessage('Authorization request not found');
				setSubMessage('It may have expired — try signing in again.');
				return;
			}
			const data = await res.json();
			if (data.redirect_url) {
				setPhase('working');
				setMessage('Redirecting...');
				window.location.href = data.redirect_url;
				return;
			}
			setClientName(data.client?.name || 'an application');
			setScopes(
				Array.from(
					new Set(
						String(data.scope || '')
							.split(/\s+/)
							.filter(Boolean),
					),
				),
			);
			setPhase('consent');
		};
		run().catch(() => {
			setPhase('error');
			setMessage('Something went wrong');
			setSubMessage('Please try signing in again.');
		});
	}, []);

	const decide = async (action: 'approve' | 'deny') => {
		setPhase('working');
		setMessage(action === 'approve' ? 'Authorizing...' : 'Cancelling...');
		setSubMessage('Please wait');
		try {
			const res = await fetch(`${OAUTH_BASE}/${authId}/consent`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ action }),
			});
			const data = await res.json();
			if (data.redirect_url) {
				window.location.href = data.redirect_url;
				return;
			}
			setPhase('error');
			setMessage('No redirect from the authorization server');
			setSubMessage('Please try again.');
		} catch {
			setPhase('error');
			setMessage('Failed to submit your decision');
			setSubMessage('Please try again.');
		}
	};

	if (phase === 'consent') {
		return (
			<div
				className={cn(
					'auth-container',
					'min-h-[200px] sm:min-h-[250px] md:min-h-[300px]',
					'flex flex-col items-center justify-center',
				)}>
				<div className="message">Authorize {clientName}</div>
				<div className="sub-message">
					{clientName} wants to sign you in with your KBVE account.
				</div>
				{scopes.length > 0 && (
					<ul className="consent-scopes">
						{scopes.map((s) => (
							<li key={s}>{SCOPE_LABELS[s] || s}</li>
						))}
					</ul>
				)}
				<div className="consent-actions">
					<button
						type="button"
						className="consent-btn consent-approve"
						onClick={() => decide('approve')}>
						Authorize
					</button>
					<button
						type="button"
						className="consent-btn consent-deny"
						onClick={() => decide('deny')}>
						Cancel
					</button>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				'auth-container',
				'min-h-[200px] sm:min-h-[250px] md:min-h-[300px]',
				'flex flex-col items-center justify-center',
			)}>
			{(phase === 'loading' || phase === 'working') && (
				<div className="spinner"></div>
			)}
			<div className="message">{message}</div>
			<div className="sub-message">{subMessage}</div>
		</div>
	);
}
