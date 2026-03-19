import {
	useEffect,
	useState,
	useCallback,
	useRef,
	createRef,
	type RefObject,
} from 'react';
import { useStore } from '@nanostores/react';
import { $auth, openModal, addToast } from '@kbve/astro';
import MemeCard from './MemeCard';
import BentoFeed from './BentoFeed';
import FeedSkeleton from './FeedSkeleton';
import CommentsDrawer from './CommentsDrawer';
import ReportModal from './ReportModal';
import {
	fetchFeed,
	reactToMeme,
	removeReaction,
	saveMeme,
	unsaveMeme,
	getUserReactions,
	getUserSaves,
	trackView,
	trackShare,
} from '../../lib/memeService';
import type { FeedMeme } from '../../lib/memeService';

const SIGNIN_MODAL = 'signin';

const PLACEHOLDER_MEMES: FeedMeme[] = [
	{
		id: 'placeholder-1',
		title: 'Welcome to Meme.sh',
		format: 1,
		asset_url: 'https://picsum.photos/seed/msh1/1200/675',
		thumbnail_url: 'https://picsum.photos/seed/msh1/600/338',
		width: 1200,
		height: 675,
		tags: ['welcome', 'featured'],
		view_count: 2400,
		reaction_count: 187,
		comment_count: 12,
		save_count: 45,
		share_count: 23,
		created_at: new Date().toISOString(),
		author_name: 'memesh',
		author_avatar: null,
	},
	{
		id: 'placeholder-2',
		title: 'When the code finally compiles',
		format: 1,
		asset_url: 'https://picsum.photos/seed/msh2/600/800',
		thumbnail_url: 'https://picsum.photos/seed/msh2/300/400',
		width: 600,
		height: 800,
		tags: ['dev', 'relatable'],
		view_count: 1280,
		reaction_count: 95,
		comment_count: 8,
		save_count: 31,
		share_count: 14,
		created_at: new Date().toISOString(),
		author_name: 'coder42',
		author_avatar: null,
	},
	{
		id: 'placeholder-3',
		title: 'Monday mood',
		format: 1,
		asset_url: 'https://picsum.photos/seed/msh3/800/800',
		thumbnail_url: 'https://picsum.photos/seed/msh3/400/400',
		width: 800,
		height: 800,
		tags: ['mood'],
		view_count: 856,
		reaction_count: 62,
		comment_count: 4,
		save_count: 18,
		share_count: 9,
		created_at: new Date().toISOString(),
		author_name: 'vibes',
		author_avatar: null,
	},
	{
		id: 'placeholder-4',
		title: 'This hits different at 3am',
		format: 1,
		asset_url: 'https://picsum.photos/seed/msh4/700/500',
		thumbnail_url: 'https://picsum.photos/seed/msh4/350/250',
		width: 700,
		height: 500,
		tags: ['latenight', 'deep'],
		view_count: 3200,
		reaction_count: 234,
		comment_count: 19,
		save_count: 67,
		share_count: 41,
		created_at: new Date().toISOString(),
		author_name: 'nightowl',
		author_avatar: null,
	},
	{
		id: 'placeholder-5',
		title: 'POV: your deploy succeeded first try',
		format: 1,
		asset_url: 'https://picsum.photos/seed/msh5/500/700',
		thumbnail_url: 'https://picsum.photos/seed/msh5/250/350',
		width: 500,
		height: 700,
		tags: ['devops', 'rare'],
		view_count: 4100,
		reaction_count: 312,
		comment_count: 27,
		save_count: 89,
		share_count: 55,
		created_at: new Date().toISOString(),
		author_name: 'sre_life',
		author_avatar: null,
	},
	{
		id: 'placeholder-6',
		title: 'The Stack Overflow experience',
		format: 1,
		asset_url: 'https://picsum.photos/seed/msh6/900/600',
		thumbnail_url: 'https://picsum.photos/seed/msh6/450/300',
		width: 900,
		height: 600,
		tags: ['stackoverflow'],
		view_count: 1500,
		reaction_count: 110,
		comment_count: 6,
		save_count: 22,
		share_count: 15,
		created_at: new Date().toISOString(),
		author_name: 'debugger',
		author_avatar: null,
	},
	{
		id: 'placeholder-7',
		title: 'CSS centering in 2026',
		format: 1,
		asset_url: 'https://picsum.photos/seed/msh7/600/900',
		thumbnail_url: 'https://picsum.photos/seed/msh7/300/450',
		width: 600,
		height: 900,
		tags: ['css', 'webdev'],
		view_count: 920,
		reaction_count: 73,
		comment_count: 11,
		save_count: 28,
		share_count: 8,
		created_at: new Date().toISOString(),
		author_name: 'frontend',
		author_avatar: null,
	},
	{
		id: 'placeholder-8',
		title: 'Me explaining my side project',
		format: 1,
		asset_url: 'https://picsum.photos/seed/msh8/800/800',
		thumbnail_url: 'https://picsum.photos/seed/msh8/400/400',
		width: 800,
		height: 800,
		tags: ['sideproject'],
		view_count: 640,
		reaction_count: 48,
		comment_count: 3,
		save_count: 15,
		share_count: 7,
		created_at: new Date().toISOString(),
		author_name: 'builder',
		author_avatar: null,
	},
];

export default function ReactMemeContent() {
	const auth = useStore($auth);

	const [memes, setMemes] = useState<FeedMeme[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(true);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);

	const [userReactions, setUserReactions] = useState<Map<string, number>>(
		new Map(),
	);
	const [userSaves, setUserSaves] = useState<Set<string>>(new Set());

	// Viewport detection for responsive layout
	const [isDesktop, setIsDesktop] = useState(false);

	// Overlay state
	const [commentsMemeId, setCommentsMemeId] = useState<string | null>(null);
	const [reportMemeId, setReportMemeId] = useState<string | null>(null);

	const scrollRef = useRef<HTMLDivElement>(null);
	const cardRefs = useRef<RefObject<HTMLDivElement | null>[]>([]);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const activeIndex = useRef(0);
	const viewedRef = useRef<Set<string>>(new Set());

	// Keep cardRefs in sync with memes length
	if (cardRefs.current.length !== memes.length) {
		cardRefs.current = memes.map(
			(_, i) => cardRefs.current[i] ?? createRef<HTMLDivElement>(),
		);
	}

	// ── Viewport detection ───────────────────────────────────────────
	useEffect(() => {
		const mq = window.matchMedia('(min-width: 768px)');
		setIsDesktop(mq.matches);
		const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	}, []);

	// ── Initial load ──────────────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const page = await fetchFeed({ limit: 5 });
				if (cancelled) return;
				if (page.memes.length > 0) {
					setMemes(page.memes);
					setCursor(page.nextCursor);
					setHasMore(page.hasMore);
				} else {
					setMemes(PLACEHOLDER_MEMES);
					setHasMore(false);
				}
			} catch {
				if (!cancelled) {
					setMemes(PLACEHOLDER_MEMES);
					setHasMore(false);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, []);

	// ── Fetch user reactions / saves when memes or auth change ────────
	useEffect(() => {
		if (auth.tone !== 'auth' || memes.length === 0) return;

		const ids = memes.map((m) => m.id);
		Promise.all([getUserReactions(ids), getUserSaves(ids)])
			.then(([reactions, saves]) => {
				setUserReactions(reactions);
				setUserSaves(saves);
			})
			.catch(() => {});
	}, [auth.tone, memes.length]);

	// ── Infinite scroll via IntersectionObserver ──────────────────────
	useEffect(() => {
		if (!sentinelRef.current || !hasMore) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
					loadMore();
				}
			},
			{ root: scrollRef.current, rootMargin: '200px' },
		);

		observer.observe(sentinelRef.current);
		return () => observer.disconnect();
	}, [hasMore, loadingMore, cursor]);

	const loadMore = useCallback(async () => {
		if (loadingMore || !hasMore) return;
		setLoadingMore(true);

		try {
			const page = await fetchFeed({ limit: 5, cursor });
			setMemes((prev) => [...prev, ...page.memes]);
			setCursor(page.nextCursor);
			setHasMore(page.hasMore);
		} catch {
			addToast({
				id: `feed-more-err-${Date.now()}`,
				message: 'Could not load more memes.',
				severity: 'error',
				duration: 4000,
			});
		} finally {
			setLoadingMore(false);
		}
	}, [loadingMore, hasMore, cursor]);

	// ── Keyboard navigation ──────────────────────────────────────────
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (memes.length === 0) return;

			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;

			let next: number;

			if (e.key === 'ArrowDown' || e.key === 'j') {
				e.preventDefault();
				next = Math.min(activeIndex.current + 1, memes.length - 1);
			} else if (e.key === 'ArrowUp' || e.key === 'k') {
				e.preventDefault();
				next = Math.max(activeIndex.current - 1, 0);
			} else {
				return;
			}

			activeIndex.current = next;
			cardRefs.current[next]?.current?.scrollIntoView({
				behavior: 'smooth',
			});
		};

		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [memes.length]);

	// ── Track which card is in view via scroll-snap ──────────────────
	useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;

		let ticking = false;
		const handleScroll = () => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(() => {
				const scrollTop = container.scrollTop;
				const viewH = container.clientHeight;
				const idx = Math.round(scrollTop / viewH);
				activeIndex.current = Math.max(
					0,
					Math.min(idx, memes.length - 1),
				);
				ticking = false;
			});
		};

		container.addEventListener('scroll', handleScroll, { passive: true });
		return () => container.removeEventListener('scroll', handleScroll);
	}, [memes.length]);

	// ── View tracking via IntersectionObserver ────────────────────────
	useEffect(() => {
		const container = scrollRef.current;
		if (!container || memes.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const memeId = entry.target.getAttribute('data-meme-id');
					if (memeId && !viewedRef.current.has(memeId)) {
						viewedRef.current.add(memeId);
						trackView(memeId).catch(() => {});
					}
				}
			},
			{ root: container, threshold: 0.5 },
		);

		for (const ref of cardRefs.current) {
			if (ref.current) observer.observe(ref.current);
		}

		return () => observer.disconnect();
	}, [memes.length]);

	// ── Reaction handler (optimistic) ────────────────────────────────
	const handleReact = useCallback(
		(memeId: string, reaction: number) => {
			const prev = userReactions.get(memeId) ?? null;
			const toggling = prev === reaction;

			// Optimistic update
			setUserReactions((map) => {
				const next = new Map(map);
				if (toggling) next.delete(memeId);
				else next.set(memeId, reaction);
				return next;
			});
			setMemes((list) =>
				list.map((m) => {
					if (m.id !== memeId) return m;
					let delta = 0;
					if (toggling) delta = -1;
					else if (prev === null) delta = 1;
					return { ...m, reaction_count: m.reaction_count + delta };
				}),
			);

			// Fire-and-forget
			const promise = toggling
				? removeReaction(memeId)
				: reactToMeme(memeId, reaction);
			promise.catch(() => {
				// Rollback
				setUserReactions((map) => {
					const next = new Map(map);
					if (prev === null) next.delete(memeId);
					else next.set(memeId, prev);
					return next;
				});
				setMemes((list) =>
					list.map((m) => {
						if (m.id !== memeId) return m;
						let delta = 0;
						if (toggling) delta = 1;
						else if (prev === null) delta = -1;
						return {
							...m,
							reaction_count: m.reaction_count + delta,
						};
					}),
				);
			});
		},
		[userReactions],
	);

	// ── Save handler (optimistic) ────────────────────────────────────
	const handleSave = useCallback((memeId: string) => {
		setUserSaves((s) => new Set(s).add(memeId));
		setMemes((list) =>
			list.map((m) =>
				m.id === memeId ? { ...m, save_count: m.save_count + 1 } : m,
			),
		);

		saveMeme(memeId).catch(() => {
			setUserSaves((s) => {
				const next = new Set(s);
				next.delete(memeId);
				return next;
			});
			setMemes((list) =>
				list.map((m) =>
					m.id === memeId
						? { ...m, save_count: m.save_count - 1 }
						: m,
				),
			);
		});
	}, []);

	const handleUnsave = useCallback((memeId: string) => {
		setUserSaves((s) => {
			const next = new Set(s);
			next.delete(memeId);
			return next;
		});
		setMemes((list) =>
			list.map((m) =>
				m.id === memeId ? { ...m, save_count: m.save_count - 1 } : m,
			),
		);

		unsaveMeme(memeId).catch(() => {
			setUserSaves((s) => new Set(s).add(memeId));
			setMemes((list) =>
				list.map((m) =>
					m.id === memeId
						? { ...m, save_count: m.save_count + 1 }
						: m,
				),
			);
		});
	}, []);

	// ── Share handler (optimistic) ──────────────────────────────────
	const handleShare = useCallback(
		async (memeId: string) => {
			const meme = memes.find((m) => m.id === memeId);
			const url = `${window.location.origin}/meme?id=${memeId}`;
			const title = meme?.title || 'Check out this meme on Meme.sh';

			// Optimistic increment
			setMemes((list) =>
				list.map((m) =>
					m.id === memeId
						? { ...m, share_count: m.share_count + 1 }
						: m,
				),
			);

			try {
				if (navigator.share) {
					await navigator.share({ title, url });
					addToast({
						id: `share-ok-${Date.now()}`,
						message: 'Shared!',
						severity: 'success',
						duration: 3000,
					});
				} else {
					await navigator.clipboard.writeText(url);
					addToast({
						id: `share-copy-${Date.now()}`,
						message: 'Link copied!',
						severity: 'success',
						duration: 3000,
					});
				}
			} catch {
				// User cancelled share or clipboard failed — rollback
				setMemes((list) =>
					list.map((m) =>
						m.id === memeId
							? { ...m, share_count: m.share_count - 1 }
							: m,
					),
				);
				return;
			}

			// Track share (fire-and-forget)
			trackShare(memeId).catch(() => {});
		},
		[memes],
	);

	// ── Comment handler ─────────────────────────────────────────────
	const handleComment = useCallback((memeId: string) => {
		setCommentsMemeId(memeId);
	}, []);

	// ── Report handler (auth-gated) ─────────────────────────────────
	const handleReport = useCallback(
		(memeId: string) => {
			if (auth.tone !== 'auth') {
				openModal(SIGNIN_MODAL);
				return;
			}
			setReportMemeId(memeId);
		},
		[auth.tone],
	);

	// ── Comment count change (optimistic from drawer) ───────────────
	const handleCommentCountChange = useCallback(
		(memeId: string, delta: number) => {
			setMemes((list) =>
				list.map((m) =>
					m.id === memeId
						? {
								...m,
								comment_count: m.comment_count + delta,
							}
						: m,
				),
			);
		},
		[],
	);

	// ── Render ───────────────────────────────────────────────────────

	if (loading)
		return <FeedSkeleton variant={isDesktop ? 'desktop' : 'mobile'} />;

	return (
		<>
			{isDesktop ? (
				<BentoFeed
					memes={memes}
					hasMore={hasMore}
					loadingMore={loadingMore}
					userReactions={userReactions}
					userSaves={userSaves}
					onReact={handleReact}
					onSave={handleSave}
					onUnsave={handleUnsave}
					onComment={handleComment}
					onShare={handleShare}
					onReport={handleReport}
					onLoadMore={loadMore}
				/>
			) : (
				<div
					ref={scrollRef}
					className="w-full"
					style={{
						height: '100dvh',
						overflowY: 'scroll',
						scrollSnapType: 'y mandatory',
						WebkitOverflowScrolling: 'touch',
						backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
					}}>
					{memes.map((meme, i) => (
						<MemeCard
							key={meme.id}
							ref={cardRefs.current[i]}
							meme={meme}
							userReaction={userReactions.get(meme.id) ?? null}
							isSaved={userSaves.has(meme.id)}
							onReact={handleReact}
							onSave={handleSave}
							onUnsave={handleUnsave}
							onComment={handleComment}
							onShare={handleShare}
							onReport={handleReport}
							lazy={i > 1}
						/>
					))}

					{/* Sentinel for infinite scroll */}
					{hasMore && (
						<div
							ref={sentinelRef}
							style={{ height: 1 }}
							aria-hidden
						/>
					)}

					{loadingMore && <FeedSkeleton variant="mobile" />}

					{!hasMore && memes.length > 0 && (
						<div
							className="flex items-center justify-center py-8"
							style={{
								height: '30dvh',
								scrollSnapAlign: 'start',
								backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
								color: 'var(--sl-color-gray-3, #71717a)',
							}}>
							<p className="text-sm">
								You've seen them all — for now.
							</p>
						</div>
					)}
				</div>
			)}

			{/* Comments drawer */}
			{commentsMemeId && (
				<CommentsDrawer
					memeId={commentsMemeId}
					commentCount={
						memes.find((m) => m.id === commentsMemeId)
							?.comment_count ?? 0
					}
					onClose={() => setCommentsMemeId(null)}
					onCommentCountChange={handleCommentCountChange}
				/>
			)}

			{/* Report modal */}
			{reportMemeId && (
				<ReportModal
					memeId={reportMemeId}
					onClose={() => setReportMemeId(null)}
				/>
			)}
		</>
	);
}
