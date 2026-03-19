import { useState, useCallback, useMemo } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { ExternalLink, Eye, Flame, Play } from 'lucide-react';
import type { FeedMeme } from '../../lib/memeService';
import {
	resolveMediaKind,
	gridThumbnail,
	showPlayOverlay,
} from '../../lib/media';

interface BentoMemeCardProps {
	meme: FeedMeme;
	featured?: boolean;
	onExpand: (meme: FeedMeme) => void;
	style?: React.CSSProperties;
}

/** Smooth deceleration — ease-out-quart equivalent, no bounce. */
const EASE_CONFIG = { tension: 170, friction: 26, clamp: true };
const SHIMMER_CONFIG = { duration: 350 };

/**
 * Derive a CSS aspect-ratio from meme dimensions.
 * Falls back to 4/3 if dimensions unknown.
 * Clamps extremes so cards never get too tall or too wide.
 */
function cardAspect(
	w: number | null,
	h: number | null,
	featured: boolean,
): string {
	if (featured) return '16 / 9';
	if (!w || !h || w <= 0 || h <= 0) return '4 / 3';

	const ratio = w / h;
	// Tall portrait: clamp at 3:4
	if (ratio < 0.75) return '3 / 4';
	// Wide landscape: clamp at 16:9
	if (ratio > 1.78) return '16 / 9';
	// Square-ish: snap to 1:1
	if (ratio > 0.9 && ratio < 1.1) return '1 / 1';
	// Natural ratio
	return `${w} / ${h}`;
}

export default function BentoMemeCard({
	meme,
	featured,
	onExpand,
	style,
}: BentoMemeCardProps) {
	const mediaKind = useMemo(
		() => resolveMediaKind(meme.asset_url, meme.format),
		[meme.asset_url, meme.format],
	);
	const thumbnail = useMemo(
		() => gridThumbnail(meme.asset_url, meme.thumbnail_url),
		[meme.asset_url, meme.thumbnail_url],
	);
	const hasPlayOverlay = showPlayOverlay(mediaKind);

	const [hovered, setHovered] = useState(false);
	const [imgLoaded, setImgLoaded] = useState(false);

	const aspect = useMemo(
		() => cardAspect(meme.width, meme.height, !!featured),
		[meme.width, meme.height, featured],
	);

	const hoverSpring = useSpring({
		scale: hovered ? 1.015 : 1,
		shadowBlur: hovered ? 16 : 0,
		overlayOpacity: hovered ? 1 : 0,
		config: EASE_CONFIG,
	});

	const shimmerSpring = useSpring({
		opacity: imgLoaded ? 0 : 1,
		config: SHIMMER_CONFIG,
	});

	const handleMouseEnter = useCallback(() => setHovered(true), []);
	const handleMouseLeave = useCallback(() => setHovered(false), []);

	const mergedTransform = hoverSpring.scale.to((s) => {
		const parentTransform =
			style?.transform && typeof style.transform === 'string'
				? style.transform
				: '';
		return `${parentTransform} scale(${s})`.trim();
	});

	return (
		<animated.button
			type="button"
			onClick={() => onExpand(meme)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			className={`relative overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
				featured ? 'md:col-span-2' : ''
			}`}
			style={{
				...style,
				transform: mergedTransform,
				boxShadow: hoverSpring.shadowBlur.to(
					(b) => `0 ${b * 0.4}px ${b}px rgba(0,0,0,0.25)`,
				),
				backgroundColor: '#161618',
			}}>
			{/* Aspect container — always static thumbnail in grid */}
			<div className="w-full relative" style={{ aspectRatio: aspect }}>
				<img
					src={thumbnail}
					alt={meme.title || 'Meme'}
					className="absolute inset-0 w-full h-full object-cover select-none"
					loading="lazy"
					draggable={false}
					onLoad={() => setImgLoaded(true)}
				/>

				{/* Play button overlay for video/YouTube */}
				{hasPlayOverlay && imgLoaded && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<div
							className="flex items-center justify-center rounded-full"
							style={{
								width: 44,
								height: 44,
								backgroundColor: 'rgba(0,0,0,0.55)',
								backdropFilter: 'blur(4px)',
							}}>
							<Play
								size={20}
								className="text-white/90"
								style={{ marginLeft: 2 }}
							/>
						</div>
					</div>
				)}

				{/* Shimmer — fades out after image loads */}
				<animated.div
					className="absolute inset-0 pointer-events-none"
					style={{
						opacity: shimmerSpring.opacity,
						background:
							'linear-gradient(110deg, #161618 30%, #1e1e21 50%, #161618 70%)',
						backgroundSize: '200% 100%',
						animation: 'shimmer 1.5s ease-in-out infinite',
					}}
				/>
			</div>

			{/* Hover overlay — editorial gradient, not glassy */}
			<animated.div
				className="absolute inset-0 flex flex-col justify-end"
				style={{ opacity: hoverSpring.overlayOpacity }}>
				<div
					className="absolute inset-0"
					style={{
						background:
							'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 45%, transparent 75%)',
					}}
				/>

				<div className="relative px-3.5 pb-3 pt-8">
					{meme.title && (
						<h3 className="text-white/95 text-[13px] font-medium leading-snug line-clamp-2 mb-1 text-left tracking-[-0.01em]">
							{meme.title}
						</h3>
					)}

					<div className="flex items-center justify-between">
						{meme.author_name && (
							<p className="text-white/40 text-[11px] tracking-wide">
								{meme.author_name}
							</p>
						)}

						<div className="flex items-center gap-2 text-white/30 text-[10px]">
							<span className="inline-flex items-center gap-0.5">
								<Eye size={10} />
								{formatCount(meme.view_count)}
							</span>
							<span className="inline-flex items-center gap-0.5">
								<Flame size={10} />
								{formatCount(meme.reaction_count)}
							</span>
						</div>
					</div>
				</div>
			</animated.div>

			{/* External link — top right on hover */}
			<animated.div
				className="absolute top-2 right-2"
				style={{ opacity: hoverSpring.overlayOpacity }}>
				<a
					href={`/meme?id=${meme.id}`}
					target="_blank"
					rel="noopener noreferrer"
					onClick={(e) => e.stopPropagation()}
					className="block p-1.5 rounded-lg transition-colors hover:bg-white/15"
					style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
					title="Open in new tab"
					aria-label="Open meme in new tab">
					<ExternalLink size={12} className="text-white/80" />
				</a>
			</animated.div>

			{/* Tags — bottom left on hover */}
			{meme.tags.length > 0 && (
				<animated.div
					className="absolute bottom-2.5 left-3 flex gap-1"
					style={{ opacity: hoverSpring.overlayOpacity }}>
					{meme.tags.slice(0, 2).map((tag) => (
						<span
							key={tag}
							className="text-[9px] px-1.5 py-px rounded text-white/50 tracking-wide uppercase"
							style={{
								backgroundColor: 'rgba(255,255,255,0.08)',
							}}>
							{tag}
						</span>
					))}
				</animated.div>
			)}

			<style>{`
				@keyframes shimmer {
					0% { background-position: 200% 0; }
					100% { background-position: -200% 0; }
				}
				@media (prefers-reduced-motion: reduce) {
					.shimmer-anim { animation: none !important; }
				}
			`}</style>
		</animated.button>
	);
}

function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}
