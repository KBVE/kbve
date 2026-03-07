import { useState, useCallback } from 'react';
import { useSpring, animated, config } from '@react-spring/web';
import { ExternalLink, Eye, Flame } from 'lucide-react';
import type { FeedMeme } from '../../lib/memeService';

interface BentoMemeCardProps {
	meme: FeedMeme;
	featured?: boolean;
	onExpand: (meme: FeedMeme) => void;
	style?: React.CSSProperties;
}

export default function BentoMemeCard({
	meme,
	featured,
	onExpand,
	style,
}: BentoMemeCardProps) {
	const isVideo = meme.format === 2 || meme.format === 3;
	const [hovered, setHovered] = useState(false);
	const [imgLoaded, setImgLoaded] = useState(false);

	const hoverSpring = useSpring({
		scale: hovered ? 1.02 : 1,
		shadow: hovered ? 20 : 0,
		overlayOpacity: hovered ? 1 : 0,
		config: config.gentle,
	});

	// Shimmer fades OUT smoothly instead of being conditionally removed
	const shimmerSpring = useSpring({
		opacity: imgLoaded ? 0 : 1,
		config: { duration: 400 },
	});

	const handleMouseEnter = useCallback(() => setHovered(true), []);
	const handleMouseLeave = useCallback(() => setHovered(false), []);

	// Merge trail transform (from parent style) with hover scale
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
			className={`relative overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
				featured ? 'md:col-span-2' : ''
			}`}
			style={{
				...style,
				transform: mergedTransform,
				boxShadow: hoverSpring.shadow.to(
					(s) =>
						`0 ${s * 0.5}px ${s}px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)`,
				),
				backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
				willChange: 'transform',
			}}>
			{/* Aspect-ratio container — dimensions are stable before image loads */}
			<div
				className={`w-full ${featured ? 'aspect-video' : 'aspect-[4/3]'} relative`}>
				{/* Image — always rendered, fills container immediately */}
				{isVideo ? (
					<video
						src={meme.asset_url}
						className="absolute inset-0 w-full h-full object-cover"
						muted
						playsInline
						preload="metadata"
						onLoadedData={() => setImgLoaded(true)}
					/>
				) : (
					<img
						src={meme.thumbnail_url || meme.asset_url}
						alt={meme.title || 'Meme'}
						className="absolute inset-0 w-full h-full object-cover select-none"
						loading="lazy"
						draggable={false}
						onLoad={() => setImgLoaded(true)}
					/>
				)}

				{/* Shimmer overlay — fades out smoothly after image loads */}
				<animated.div
					className="absolute inset-0 overflow-hidden pointer-events-none"
					style={{
						opacity: shimmerSpring.opacity,
						background:
							'linear-gradient(110deg, var(--sl-color-gray-6, #1c1c1e) 30%, var(--sl-color-gray-5, #27272a) 50%, var(--sl-color-gray-6, #1c1c1e) 70%)',
						backgroundSize: '200% 100%',
						animation: 'shimmer 1.5s ease-in-out infinite',
					}}
				/>
			</div>

			{/* Hover overlay */}
			<animated.div
				className="absolute inset-0 flex flex-col justify-end"
				style={{ opacity: hoverSpring.overlayOpacity }}>
				{/* Gradient */}
				<div
					className="absolute inset-0"
					style={{
						background:
							'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)',
					}}
				/>

				{/* Content */}
				<div className="relative p-3.5 pb-3">
					{meme.title && (
						<h3 className="text-white text-sm font-semibold leading-snug line-clamp-2 mb-1.5 text-left">
							{meme.title}
						</h3>
					)}

					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							{meme.author_name && (
								<p className="text-white/50 text-xs">
									@{meme.author_name}
								</p>
							)}
						</div>

						{/* Stats */}
						<div className="flex items-center gap-2.5 text-white/40 text-[11px]">
							<span className="inline-flex items-center gap-1">
								<Eye size={11} />
								{formatCount(meme.view_count)}
							</span>
							<span className="inline-flex items-center gap-1">
								<Flame size={11} />
								{formatCount(meme.reaction_count)}
							</span>
						</div>
					</div>
				</div>
			</animated.div>

			{/* Share button — top-right, visible on hover */}
			<animated.div
				className="absolute top-2.5 right-2.5"
				style={{ opacity: hoverSpring.overlayOpacity }}>
				<a
					href={`/meme?id=${meme.id}`}
					target="_blank"
					rel="noopener noreferrer"
					onClick={(e) => e.stopPropagation()}
					className="block p-1.5 rounded-lg backdrop-blur-md transition-colors hover:bg-white/20"
					style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
					title="Open in new tab"
					aria-label="Open meme in new tab">
					<ExternalLink size={13} className="text-white/90" />
				</a>
			</animated.div>

			{/* Tags — bottom-left on hover */}
			{meme.tags.length > 0 && (
				<animated.div
					className="absolute bottom-2.5 left-3 flex gap-1.5"
					style={{ opacity: hoverSpring.overlayOpacity }}>
					{meme.tags.slice(0, 2).map((tag) => (
						<span
							key={tag}
							className="text-[10px] px-2 py-0.5 rounded-full backdrop-blur-md text-white/60"
							style={{
								backgroundColor: 'rgba(255,255,255,0.1)',
							}}>
							#{tag}
						</span>
					))}
				</animated.div>
			)}

			<style>{`
				@keyframes shimmer {
					0% { background-position: 200% 0; }
					100% { background-position: -200% 0; }
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
