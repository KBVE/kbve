import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $auth, openModal } from '@kbve/astro';
import { Copy, Check, LogIn, Mail, Send, Clock, AlertCircle } from 'lucide-react';
import { initSupa } from '../../lib/supa';
import { ApiError, getMailbox, type MailboxStats } from '../../lib/api';

export default function ReactProfile() {
	const auth = useStore($auth);
	const [stats, setStats] = useState<MailboxStats | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		initSupa().catch(() => {});
	}, []);

	useEffect(() => {
		if (auth.tone !== 'auth') {
			setStats(null);
			return;
		}
		let cancelled = false;
		getMailbox()
			.then((s) => {
				if (!cancelled) setStats(s);
			})
			.catch((err) => {
				if (cancelled) return;
				setError(
					err instanceof ApiError && err.status === 401
						? 'Your session ended. Sign in again.'
						: 'Could not load your mailbox.',
				);
			});
		return () => {
			cancelled = true;
		};
	}, [auth.tone]);

	const copy = async () => {
		if (!stats?.address) return;
		try {
			await navigator.clipboard.writeText(stats.address);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard blocked; the address is still visible
		}
	};

	if (auth.tone === 'loading') {
		return (
			<div className="hm-shell hm-center">
				<div className="hm-spinner" aria-label="Loading" />
			</div>
		);
	}

	if (auth.tone !== 'auth') {
		return (
			<div className="hm-shell hm-center">
				<div className="hm-gate">
					<Mail size={36} />
					<h2>Your address</h2>
					<p>Sign in to see your herbmail address and limits.</p>
					<button
						type="button"
						className="hm-btn hm-btn-accent"
						onClick={() => openModal('signin')}
					>
						<LogIn size={16} /> Sign in
					</button>
				</div>
			</div>
		);
	}

	const remaining = stats ? Math.max(0, stats.daily_cap - stats.sent_24h) : null;

	return (
		<div className="hm-profile">
			{error && (
				<div className="hm-alert hm-alert-error">
					<AlertCircle size={16} /> {error}
				</div>
			)}

			<section className="hm-card">
				<h2>Address</h2>
				{stats?.address ? (
					<div className="hm-address">
						<code>{stats.address}</code>
						<button
							type="button"
							className="hm-icon-btn"
							onClick={() => void copy()}
							title="Copy address"
						>
							{copied ? <Check size={16} /> : <Copy size={16} />}
						</button>
					</div>
				) : stats ? (
					<p className="hm-muted">
						No username yet. Pick one on{' '}
						<a href="https://kbve.com/profile" rel="noopener">
							kbve.com
						</a>{' '}
						and it becomes your address.
					</p>
				) : (
					<div className="hm-spinner" aria-label="Loading" />
				)}
				<p className="hm-muted">
					Anyone can write to it. You can reply to anyone who wrote to you.
				</p>
			</section>

			{stats && (
				<section className="hm-stats">
					<div className="hm-stat">
						<Mail size={18} />
						<strong>{stats.inbound}</strong>
						<span>received</span>
					</div>
					<div className="hm-stat">
						<Send size={18} />
						<strong>{stats.outbound}</strong>
						<span>sent</span>
					</div>
					<div className="hm-stat">
						<Clock size={18} />
						<strong>
							{remaining}/{stats.daily_cap}
						</strong>
						<span>replies left today</span>
					</div>
				</section>
			)}

			<section className="hm-card">
				<h2>Rules</h2>
				<ul className="hm-rules">
					<li>Mail is kept for {stats?.retention_days ?? 90} days, then purged.</li>
					<li>
						Outbound is reply-only: the recipient must have emailed you first.
					</li>
					<li>{stats?.daily_cap ?? 20} replies per rolling 24 hours.</li>
					<li>Plain text only. No attachments on the way out.</li>
				</ul>
			</section>
		</div>
	);
}
