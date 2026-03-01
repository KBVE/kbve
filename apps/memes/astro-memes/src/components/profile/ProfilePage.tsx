import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $auth, openModal, addToast } from '@kbve/astro';
import { User, Edit3, Save, ExternalLink } from 'lucide-react';
import {
	getProfile,
	updateProfile,
	getUserMemes,
	type UserProfile,
	type FeedMeme,
} from '../../lib/memeService';

const SIGNIN_MODAL = 'signin';

export default function ProfilePage() {
	const auth = useStore($auth);

	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [memes, setMemes] = useState<FeedMeme[]>([]);
	const [memesCursor, setMemesCursor] = useState<string | null>(null);
	const [hasMoreMemes, setHasMoreMemes] = useState(true);
	const [loading, setLoading] = useState(true);
	const [loadingMemes, setLoadingMemes] = useState(false);

	const [editing, setEditing] = useState(false);
	const [editName, setEditName] = useState('');
	const [editBio, setEditBio] = useState('');
	const [saving, setSaving] = useState(false);

	// Fetch profile + memes on auth
	useEffect(() => {
		if (auth.tone !== 'auth') {
			setLoading(false);
			return;
		}

		let cancelled = false;

		async function load() {
			try {
				const [prof, memesPage] = await Promise.all([
					getProfile(auth.id),
					getUserMemes(auth.id, { limit: 12 }),
				]);
				if (cancelled) return;
				setProfile(prof);
				setMemes(memesPage.memes);
				setMemesCursor(memesPage.nextCursor);
				setHasMoreMemes(memesPage.hasMore);
				if (prof) {
					setEditName(prof.display_name || '');
					setEditBio(prof.bio || '');
				}
			} catch {
				if (!cancelled) {
					addToast({
						id: `profile-err-${Date.now()}`,
						message: 'Failed to load profile.',
						severity: 'error',
						duration: 4000,
					});
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [auth.tone, auth.id]);

	const loadMoreMemes = useCallback(async () => {
		if (loadingMemes || !hasMoreMemes || auth.tone !== 'auth') return;
		setLoadingMemes(true);
		try {
			const page = await getUserMemes(auth.id, {
				limit: 12,
				cursor: memesCursor,
			});
			setMemes((prev) => [...prev, ...page.memes]);
			setMemesCursor(page.nextCursor);
			setHasMoreMemes(page.hasMore);
		} catch {
			addToast({
				id: `memes-more-err-${Date.now()}`,
				message: 'Failed to load more memes.',
				severity: 'error',
				duration: 4000,
			});
		} finally {
			setLoadingMemes(false);
		}
	}, [loadingMemes, hasMoreMemes, memesCursor, auth]);

	const handleSaveProfile = useCallback(async () => {
		if (saving) return;
		setSaving(true);
		try {
			await updateProfile({
				display_name: editName.trim() || undefined,
				bio: editBio.trim() || undefined,
			});
			setProfile((prev) =>
				prev
					? {
							...prev,
							display_name: editName.trim() || prev.display_name,
							bio: editBio.trim() || prev.bio,
						}
					: prev,
			);
			setEditing(false);
			addToast({
				id: `profile-saved-${Date.now()}`,
				message: 'Profile updated.',
				severity: 'success',
				duration: 3000,
			});
		} catch {
			addToast({
				id: `profile-save-err-${Date.now()}`,
				message: 'Failed to save profile.',
				severity: 'error',
				duration: 4000,
			});
		} finally {
			setSaving(false);
		}
	}, [saving, editName, editBio]);

	// ── Not authenticated ───────────────────────────────────────────
	if (auth.tone === 'loading' || loading) {
		return (
			<div
				className="flex items-center justify-center"
				style={{
					height: '100dvh',
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
					color: 'var(--sl-color-gray-3, #71717a)',
				}}>
				<p className="text-sm">Loading...</p>
			</div>
		);
	}

	if (auth.tone !== 'auth') {
		return (
			<div
				className="flex flex-col items-center justify-center gap-4"
				style={{
					height: '100dvh',
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
					color: 'var(--sl-color-gray-2, #a1a1aa)',
				}}>
				<User
					size={48}
					style={{ color: 'var(--sl-color-gray-3, #71717a)' }}
				/>
				<p className="text-sm">Sign in to view your profile</p>
				<button
					type="button"
					onClick={() => openModal(SIGNIN_MODAL)}
					className="text-sm px-4 py-2 rounded-lg transition-colors"
					style={{
						backgroundColor: 'var(--sl-color-accent, #0ea5e9)',
						color: '#fff',
					}}>
					Sign In
				</button>
			</div>
		);
	}

	// ── Authenticated ───────────────────────────────────────────────
	return (
		<div
			className="min-h-screen pb-12"
			style={{
				backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
				color: 'var(--sl-color-white, #e2e8f0)',
			}}>
			<div className="max-w-2xl mx-auto px-4 pt-20">
				{/* Profile header */}
				<div className="flex items-start gap-4 mb-6">
					{/* Avatar */}
					{profile?.avatar_url || auth.avatar ? (
						<img
							src={profile?.avatar_url || auth.avatar}
							alt=""
							className="w-20 h-20 rounded-full flex-shrink-0"
						/>
					) : (
						<div
							className="w-20 h-20 rounded-full flex-shrink-0 flex items-center justify-center"
							style={{
								backgroundColor:
									'var(--sl-color-accent-low, #164e63)',
							}}>
							<User
								size={32}
								style={{
									color: 'var(--sl-color-text-accent, #22d3ee)',
								}}
							/>
						</div>
					)}

					<div className="flex-1 min-w-0">
						{editing ? (
							<div className="space-y-3">
								<input
									value={editName}
									onChange={(e) =>
										setEditName(
											e.target.value.slice(0, 50),
										)
									}
									placeholder="Display name"
									className="w-full rounded-lg px-3 py-2 text-sm outline-none"
									style={{
										backgroundColor:
											'var(--sl-color-gray-6, #1c1c1e)',
										color: 'var(--sl-color-white, #e2e8f0)',
										border: '1px solid var(--sl-color-hairline, #27272a)',
									}}
								/>
								<textarea
									value={editBio}
									onChange={(e) =>
										setEditBio(
											e.target.value.slice(0, 200),
										)
									}
									placeholder="Bio"
									rows={3}
									className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
									style={{
										backgroundColor:
											'var(--sl-color-gray-6, #1c1c1e)',
										color: 'var(--sl-color-white, #e2e8f0)',
										border: '1px solid var(--sl-color-hairline, #27272a)',
									}}
								/>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={handleSaveProfile}
										disabled={saving}
										className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
										style={{
											backgroundColor:
												'var(--sl-color-accent, #0ea5e9)',
											color: '#fff',
										}}>
										<Save size={14} />
										{saving ? 'Saving...' : 'Save'}
									</button>
									<button
										type="button"
										onClick={() => {
											setEditing(false);
											setEditName(
												profile?.display_name || '',
											);
											setEditBio(profile?.bio || '');
										}}
										className="px-3 py-1.5 rounded-lg text-sm"
										style={{
											color: 'var(--sl-color-gray-2, #a1a1aa)',
										}}>
										Cancel
									</button>
								</div>
							</div>
						) : (
							<>
								<div className="flex items-center gap-2">
									<h1 className="text-xl font-bold truncate">
										{profile?.display_name ||
											auth.name ||
											'User'}
									</h1>
									<button
										type="button"
										onClick={() => setEditing(true)}
										className="flex-shrink-0"
										style={{
											color: 'var(--sl-color-text-accent, #22d3ee)',
										}}>
										<Edit3 size={16} />
									</button>
								</div>
								{profile?.bio && (
									<p
										className="text-sm mt-1"
										style={{
											color: 'var(--sl-color-gray-2, #a1a1aa)',
										}}>
										{profile.bio}
									</p>
								)}
								{profile?.display_name && (
									<a
										href={`https://kbve.com/@${profile.display_name}`}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1 text-xs mt-2 transition-colors hover:opacity-80"
										style={{
											color: 'var(--sl-color-text-accent, #22d3ee)',
										}}>
										<ExternalLink size={12} />
										kbve.com/@{profile.display_name}
									</a>
								)}
							</>
						)}
					</div>
				</div>

				{/* Stats row */}
				{profile && (
					<div
						className="flex gap-6 mb-8 pb-4"
						style={{
							borderBottom:
								'1px solid var(--sl-color-hairline, #27272a)',
						}}>
						<Stat
							label="Memes"
							value={profile.total_memes}
						/>
						<Stat
							label="Followers"
							value={profile.follower_count}
						/>
						<Stat
							label="Following"
							value={profile.following_count}
						/>
						<Stat
							label="Reactions"
							value={profile.total_reactions_received}
						/>
						<Stat
							label="Views"
							value={profile.total_views_received}
						/>
					</div>
				)}

				{/* User's memes grid */}
				<h2
					className="text-sm font-semibold mb-4"
					style={{
						color: 'var(--sl-color-gray-2, #a1a1aa)',
					}}>
					Your Memes
				</h2>

				{memes.length === 0 ? (
					<p
						className="text-sm text-center py-8"
						style={{
							color: 'var(--sl-color-gray-3, #71717a)',
						}}>
						You haven't posted any memes yet.
					</p>
				) : (
					<>
						<div className="grid grid-cols-3 gap-1">
							{memes.map((meme) => (
								<div
									key={meme.id}
									className="aspect-square relative overflow-hidden rounded"
									style={{
										backgroundColor:
											'var(--sl-color-gray-6, #1c1c1e)',
									}}>
									<img
										src={
											meme.thumbnail_url ||
											meme.asset_url
										}
										alt={meme.title || 'Meme'}
										className="w-full h-full object-cover"
										loading="lazy"
									/>
									<div
										className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10px] flex items-center gap-2"
										style={{
											background:
												'linear-gradient(transparent, rgba(0,0,0,0.7))',
											color: 'rgba(255,255,255,0.8)',
										}}>
										<span>
											{formatCount(meme.view_count)} views
										</span>
										<span>
											{formatCount(meme.reaction_count)}{' '}
											reactions
										</span>
									</div>
								</div>
							))}
						</div>

						{hasMoreMemes && (
							<div className="flex justify-center mt-4">
								<button
									type="button"
									onClick={loadMoreMemes}
									disabled={loadingMemes}
									className="text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
									style={{
										backgroundColor:
											'var(--sl-color-accent-low, #164e63)',
										color: 'var(--sl-color-text-accent, #22d3ee)',
									}}>
									{loadingMemes
										? 'Loading...'
										: 'Load More'}
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="text-center">
			<div className="text-base font-bold">{formatCount(value)}</div>
			<div
				className="text-[11px]"
				style={{ color: 'var(--sl-color-gray-3, #71717a)' }}>
				{label}
			</div>
		</div>
	);
}

function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}
