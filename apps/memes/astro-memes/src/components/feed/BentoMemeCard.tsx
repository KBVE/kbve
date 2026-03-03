import { ExternalLink, Eye, Flame } from 'lucide-react';
import type { FeedMeme } from '../../lib/memeService';

interface BentoMemeCardProps {
	meme: FeedMeme;
	featured?: boolean;
	onExpand: (meme: FeedMeme) => void;
}

export default function BentoMemeCard({
	meme,
	featured,
	onExpand,
}: BentoMemeCardProps) {
	const isVideo = meme.format === 2 || meme.format === 3;

	return (
		<button
			type="button"
			onClick={() => onExpand(meme)}
			className={`group relative overflow-hidden rounded-xl transition-shadow duration-200 hover:shadow-lg hover:shadow-black/30 focus:outline-none ${
				featured ? 'md:col-span-2' : ''
			}`}
			style={{
				border: '1px solid var(--sl-color-hairline, rgba(255,255,255,0.06))',
				backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
			}}>
			{/* Thumbnail */}
			<div
				className={`w-full ${featured ? 'aspect-video' : 'aspect-[4/3]'}`}>
				{isVideo ? (
					<video
						src={meme.asset_url}
						className="w-full h-full object-cover"
						muted
						playsInline
						preload="metadata"
					/>
				) : (
					<img
						src={meme.thumbnail_url || meme.asset_url}
						alt={meme.title || 'Meme'}
						className="w-full h-full object-cover select-none"
						loading="lazy"
						draggable={false}
					/>
				)}
			</div>

			{/* Hover overlay */}
			<div className="absolute inset-0 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
				{/* Gradient */}
				<div
					className="absolute inset-0"
					style={{
						background:
							'linear-gradient(transparent 30%, rgba(0,0,0,0.75))',
					}}
				/>

				{/* Content */}
				<div className="relative p-3">
					{meme.title && (
						<h3 className="text-white text-sm font-semibold leading-tight line-clamp-2 mb-1.5">
							{meme.title}
						</h3>
					)}

					{meme.author_name && (
						<p className="text-white/60 text-xs mb-2">
							@{meme.author_name}
						</p>
					)}

					{/* Stats row */}
					<div className="flex items-center gap-3 text-white/50 text-xs">
						<span className="inline-flex items-center gap-1">
							<Eye size={12} />
							{formatCount(meme.view_count)}
						</span>
						<span className="inline-flex items-center gap-1">
							<Flame size={12} />
							{formatCount(meme.reaction_count)}
						</span>
					</div>
				</div>
			</div>

			{/* Share button — always visible top-right */}
			<a
				href={`/meme?id=${meme.id}`}
				target="_blank"
				rel="noopener noreferrer"
				onClick={(e) => e.stopPropagation()}
				className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm"
				style={{
					backgroundColor: 'rgba(0,0,0,0.4)',
				}}
				title="Open in new tab"
				aria-label="Open meme in new tab">
				<ExternalLink size={14} className="text-white/80" />
			</a>

			{/* Tags — bottom-left, visible without hover */}
			{meme.tags.length > 0 && (
				<div className="absolute bottom-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
					{meme.tags.slice(0, 2).map((tag) => (
						<span
							key={tag}
							className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 backdrop-blur-sm">
							#{tag}
						</span>
					))}
				</div>
			)}
		</button>
	);
}

function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}
