// Portfolio media renderer — the portfolio-first, "show the work" core feature.
// Heavy embeds (YouTube / itch.io builds) are click-to-play so the profile stays
// fast and we don't hammer third parties on load (itch.io's own pattern).

import { useState } from 'react';
import type { Media, PortfolioItem } from '../api/types';
import { TagRow } from './ui';

function ClickToPlay({
	media,
	src,
}: {
	media: Media;
	src: string;
}) {
	const [playing, setPlaying] = useState(false);
	if (playing) {
		return (
			<iframe
				src={src}
				title={media.caption}
				allow="autoplay; fullscreen; encrypted-media"
				allowFullScreen
				className="aspect-video w-full rounded-lg border border-zinc-800"
			/>
		);
	}
	return (
		<button
			type="button"
			onClick={() => setPlaying(true)}
			style={
				media.poster_url
					? { backgroundImage: `url(${media.poster_url})` }
					: undefined
			}
			className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 bg-cover bg-center">
			<span className="absolute inset-0 bg-black/40 transition group-hover:bg-black/25" />
			<span className="relative flex flex-col items-center gap-2">
				<span className="flex h-14 w-14 items-center justify-center rounded-full bg-quest-500/90 text-2xl text-white shadow-lg shadow-quest-900/50">
					▶
				</span>
				<span className="rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-zinc-100">
					Click to play
				</span>
			</span>
		</button>
	);
}

function MediaView({ media }: { media: Media }) {
	switch (media.kind) {
		case 'image':
			return (
				<img
					src={media.url}
					alt={media.caption}
					loading="lazy"
					className="w-full rounded-lg border border-zinc-800 object-cover"
				/>
			);
		case 'video':
			return (
				<video
					controls
					poster={media.poster_url}
					src={media.url}
					className="aspect-video w-full rounded-lg border border-zinc-800 bg-black"
				/>
			);
		case 'audio':
			return (
				<div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
					<audio controls src={media.url} className="w-full" />
				</div>
			);
		case 'youtube':
			return (
				<ClickToPlay
					media={media}
					src={`https://www.youtube-nocookie.com/embed/${media.url}?autoplay=1`}
				/>
			);
		case 'itch':
			return <ClickToPlay media={media} src={media.url} />;
		default:
			return null;
	}
}

export function PortfolioCard({ item }: { item: PortfolioItem }) {
	return (
		<div className="panel overflow-hidden">
			{item.media[0] ? <MediaView media={item.media[0]} /> : null}
			<div className="space-y-2 p-4">
				<h4 className="font-display font-semibold text-zinc-100">
					{item.title}
				</h4>
				<p className="text-sm text-zinc-400">{item.description}</p>
				{item.media[0]?.caption ? (
					<p className="text-xs text-zinc-500">{item.media[0].caption}</p>
				) : null}
				<TagRow items={item.tags} />
			</div>
		</div>
	);
}
