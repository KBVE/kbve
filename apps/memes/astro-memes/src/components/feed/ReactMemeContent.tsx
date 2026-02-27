import {
	useEffect,
	useState,
	useCallback,
	useRef,
	createRef,
	type RefObject,
} from 'react';
import { useStore } from '@nanostores/react';
import { $auth, addToast } from '@kbve/astro';
import MemeCard from './MemeCard';
import FeedSkeleton from './FeedSkeleton';
import {
	fetchFeed,
	reactToMeme,
	removeReaction,
	saveMeme,
	unsaveMeme,
	getUserReactions,
	getUserSaves,
} from '../../lib/memeService';
import type { FeedMeme } from '../../lib/memeService';

export default function ReactMemeContent() {
	const auth = useStore($auth);

	const [memes, setMemes] = useState<FeedMeme[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(true);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [userReactions, setUserReactions] = useState<Map<string, number>>(
		new Map(),
	);
	const [userSaves, setUserSaves] = useState<Set<string>>(new Set());

	const scrollRef = useRef<HTMLDivElement>(null);
	const cardRefs = useRef<RefObject<HTMLDivElement | null>[]>([]);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const activeIndex = useRef(0);

	// Keep cardRefs in sync with memes length
	if (cardRefs.current.length !== memes.length) {
		cardRefs.current = memes.map(
			(_, i) => cardRefs.current[i] ?? createRef<HTMLDivElement>(),
		);
	}

	// ── Initial load ──────────────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const page = await fetchFeed({ limit: 5 });
				if (cancelled) return;
				setMemes(page.memes);
				setCursor(page.nextCursor);
				setHasMore(page.hasMore);
			} catch {
				if (!cancelled) {
					setError('Failed to load feed');
					addToast({
						id: `feed-err-${Date.now()}`,
						message: 'Could not load memes. Try again later.',
						severity: 'error',
						duration: 5000,
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

			let next = activeIndex.current;

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
				m.id === memeId
					? { ...m, save_count: m.save_count + 1 }
					: m,
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
				m.id === memeId
					? { ...m, save_count: m.save_count - 1 }
					: m,
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

	// ── Render ───────────────────────────────────────────────────────

	if (loading) return <FeedSkeleton />;

	if (error) {
		return (
			<div
				className="flex flex-col items-center justify-center gap-4"
				style={{
					height: '100dvh',
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
					color: 'var(--sl-color-gray-2, #a1a1aa)',
				}}>
				<p className="text-sm">{error}</p>
				<button
					type="button"
					onClick={() => window.location.reload()}
					className="text-sm px-4 py-2 rounded-lg transition-colors"
					style={{
						backgroundColor: 'var(--sl-color-accent, #0ea5e9)',
						color: '#fff',
					}}>
					Retry
				</button>
			</div>
		);
	}

	return (
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
					lazy={i > 1}
				/>
			))}

			{/* Sentinel for infinite scroll */}
			{hasMore && (
				<div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
			)}

			{loadingMore && <FeedSkeleton />}

			{!hasMore && memes.length > 0 && (
				<div
					className="flex items-center justify-center py-8"
					style={{
						height: '30dvh',
						scrollSnapAlign: 'start',
						backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
						color: 'var(--sl-color-gray-3, #71717a)',
					}}>
					<p className="text-sm">You've seen them all — for now.</p>
				</div>
			)}
		</div>
	);
}
