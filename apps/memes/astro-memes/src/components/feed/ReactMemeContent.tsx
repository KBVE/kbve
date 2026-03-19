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
	$feedMemes,
	$feedHasMore,
	$feedLoading,
	$userReactions,
	$userSaves,
	loadFeed,
	loadMore,
	reactToMeme,
	saveMeme,
	unsaveMeme,
	trackView,
	trackShare,
} from '../../lib/stores/feed';
import { PLACEHOLDER_MEMES } from '../../lib/stores/placeholders';

const SIGNIN_MODAL = 'signin';

export default function ReactMemeContent() {
	const auth = useStore($auth);
	const memes = useStore($feedMemes);
	const hasMore = useStore($feedHasMore);
	const feedLoading = useStore($feedLoading);
	const userReactions = useStore($userReactions);
	const userSaves = useStore($userSaves);

	// ── Local UI state (not shared across islands) ────────────────
	const [isDesktop, setIsDesktop] = useState(false);
	const [commentsMemeId, setCommentsMemeId] = useState<string | null>(null);
	const [reportMemeId, setReportMemeId] = useState<string | null>(null);
	const [initialLoaded, setInitialLoaded] = useState(false);

	// Mobile scroll-snap refs
	const scrollRef = useRef<HTMLDivElement>(null);
	const cardRefs = useRef<RefObject<HTMLDivElement | null>[]>([]);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const activeIndex = useRef(0);

	if (cardRefs.current.length !== memes.length) {
		cardRefs.current = memes.map(
			(_, i) => cardRefs.current[i] ?? createRef<HTMLDivElement>(),
		);
	}

	// ── Viewport detection ───────────────────────────────────────
	useEffect(() => {
		const mq = window.matchMedia('(min-width: 768px)');
		setIsDesktop(mq.matches);
		const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	}, []);

	// ── Initial feed load ────────────────────────────────────────
	useEffect(() => {
		loadFeed().then(() => {
			// If store is still empty after load, use placeholders
			if ($feedMemes.get().length === 0) {
				$feedMemes.set(PLACEHOLDER_MEMES);
				$feedHasMore.set(false);
			}
			setInitialLoaded(true);
		});
	}, []);

	// ── Mobile infinite scroll ───────────────────────────────────
	useEffect(() => {
		if (!sentinelRef.current || !hasMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (
					entries[0]?.isIntersecting &&
					hasMore &&
					feedLoading === 'idle'
				) {
					loadMore();
				}
			},
			{ root: scrollRef.current, rootMargin: '200px' },
		);
		observer.observe(sentinelRef.current);
		return () => observer.disconnect();
	}, [hasMore, feedLoading]);

	// ── Keyboard navigation (mobile scroll-snap) ─────────────────
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

	// ── Mobile scroll index tracking ─────────────────────────────
	useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;
		let ticking = false;
		const handleScroll = () => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(() => {
				const idx = Math.round(
					container.scrollTop / container.clientHeight,
				);
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

	// ── View tracking ────────────────────────────────────────────
	useEffect(() => {
		const container = scrollRef.current;
		if (!container || memes.length === 0) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const memeId = entry.target.getAttribute('data-meme-id');
					if (memeId) trackView(memeId);
				}
			},
			{ root: container, threshold: 0.5 },
		);
		for (const ref of cardRefs.current) {
			if (ref.current) observer.observe(ref.current);
		}
		return () => observer.disconnect();
	}, [memes.length]);

	// ── Handlers (thin wrappers around store actions) ─────────────

	const handleReact = useCallback((memeId: string, reaction: number) => {
		if ($auth.get().tone !== 'auth') {
			openModal(SIGNIN_MODAL);
			return;
		}
		reactToMeme(memeId, reaction);
	}, []);

	const handleSave = useCallback((memeId: string) => {
		if ($auth.get().tone !== 'auth') {
			openModal(SIGNIN_MODAL);
			return;
		}
		saveMeme(memeId);
	}, []);

	const handleUnsave = useCallback((memeId: string) => {
		unsaveMeme(memeId);
	}, []);

	const handleShare = useCallback(
		async (memeId: string) => {
			const meme = memes.find((m) => m.id === memeId);
			const url = `${window.location.origin}/meme?id=${memeId}`;
			const title = meme?.title || 'Check out this meme on Meme.sh';

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
				return;
			}
			trackShare(memeId);
		},
		[memes],
	);

	const handleComment = useCallback((memeId: string) => {
		setCommentsMemeId(memeId);
	}, []);

	const handleReport = useCallback((memeId: string) => {
		if ($auth.get().tone !== 'auth') {
			openModal(SIGNIN_MODAL);
			return;
		}
		setReportMemeId(memeId);
	}, []);

	const handleCommentCountChange = useCallback(
		(memeId: string, delta: number) => {
			$feedMemes.set(
				$feedMemes
					.get()
					.map((m) =>
						m.id === memeId
							? { ...m, comment_count: m.comment_count + delta }
							: m,
					),
			);
		},
		[],
	);

	// ── Convert nanostore state to props format ──────────────────
	const userReactionsMap = new Map(
		Object.entries(userReactions).map(
			([k, v]) => [k, v] as [string, number],
		),
	);

	// ── Render ───────────────────────────────────────────────────

	if (!initialLoaded)
		return <FeedSkeleton variant={isDesktop ? 'desktop' : 'mobile'} />;

	return (
		<>
			{isDesktop ? (
				<BentoFeed
					memes={memes}
					hasMore={hasMore}
					loadingMore={feedLoading === 'more'}
					userReactions={userReactionsMap}
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
						backgroundColor: '#0c0c0e',
					}}>
					{memes.map((meme, i) => (
						<MemeCard
							key={meme.id}
							ref={cardRefs.current[i]}
							meme={meme}
							userReaction={userReactionsMap.get(meme.id) ?? null}
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

					{hasMore && (
						<div
							ref={sentinelRef}
							style={{ height: 1 }}
							aria-hidden
						/>
					)}

					{feedLoading === 'more' && (
						<FeedSkeleton variant="mobile" />
					)}

					{!hasMore && memes.length > 0 && (
						<div
							className="flex items-center justify-center py-8"
							style={{
								height: '30dvh',
								scrollSnapAlign: 'start',
								backgroundColor: '#0c0c0e',
								color: '#3a3a3f',
							}}>
							<p className="text-[13px] tracking-widest uppercase">
								End of feed
							</p>
						</div>
					)}
				</div>
			)}

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

			{reportMemeId && (
				<ReportModal
					memeId={reportMemeId}
					onClose={() => setReportMemeId(null)}
				/>
			)}
		</>
	);
}
