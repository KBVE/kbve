import { useState, useEffect, useCallback } from 'react';

interface Genre {
	slug: string;
	title: string;
	tracks: string[];
	sets: string[];
}

interface Props {
	genres: Genre[];
}

export default function ReactJukebox({ genres }: Props) {
	const [activeGenreSlug, setActiveGenreSlug] = useState<string>(
		genres[0]?.slug ?? '',
	);
	const [activeYt, setActiveYt] = useState<string | null>(null);

	const activeGenre =
		genres.find((g) => g.slug === activeGenreSlug) ?? genres[0] ?? null;
	const allItems = activeGenre
		? [...activeGenre.tracks, ...activeGenre.sets]
		: [];
	const currentIndex = activeYt ? allItems.indexOf(activeYt) : -1;

	const playTrack = useCallback((ytId: string) => {
		setActiveYt(ytId);
		const url = new URL(window.location.href);
		url.searchParams.set('yt', ytId);
		window.history.replaceState({}, '', url.toString());
	}, []);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const yt = params.get('yt');
		if (yt) {
			setActiveYt(yt);
			for (const g of genres) {
				if (g.tracks.includes(yt) || g.sets.includes(yt)) {
					setActiveGenreSlug(g.slug);
					break;
				}
			}
		} else if (genres[0]) {
			const first = genres[0].tracks[0] ?? genres[0].sets[0] ?? null;
			setActiveYt(first);
		}
	}, []);

	const selectGenre = useCallback(
		(slug: string) => {
			const g = genres.find((x) => x.slug === slug);
			if (!g) return;
			setActiveGenreSlug(slug);
			const first = g.tracks[0] ?? g.sets[0] ?? null;
			if (first) playTrack(first);
		},
		[genres, playTrack],
	);

	return (
		<div className="flex h-full bg-[#0d0d1a] text-white overflow-hidden select-none">
			{/* Genre sidebar */}
			<div className="w-36 flex-shrink-0 border-r border-white/10 flex flex-col overflow-hidden">
				<div className="px-3 py-2 text-[10px] uppercase tracking-widest text-white/25 border-b border-white/10 flex-shrink-0">
					Genres
				</div>
				<div className="flex-1 overflow-y-auto">
					{genres.map((g) => (
						<button
							key={g.slug}
							onClick={() => selectGenre(g.slug)}
							className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-white/5 ${
								g.slug === activeGenreSlug
									? 'bg-purple-800/50 text-purple-200 font-medium'
									: 'text-white/55 hover:bg-white/5 hover:text-white'
							}`}>
							{g.title}
						</button>
					))}
				</div>
			</div>

			{/* Main column */}
			<div className="flex flex-1 flex-col min-w-0 overflow-hidden">
				{/* Player — 45% of the container height */}
				<div
					className="flex-shrink-0 bg-black"
					style={{ height: '45%' }}>
					{activeYt ? (
						<iframe
							key={activeYt}
							className="w-full h-full"
							src={`https://www.youtube.com/embed/${activeYt}?autoplay=1&rel=0`}
							allow="autoplay; fullscreen; picture-in-picture"
							allowFullScreen
							title="Jukebox Player"
						/>
					) : (
						<div className="w-full h-full flex items-center justify-center text-white/20 text-sm">
							Select a track to begin
						</div>
					)}
				</div>

				{/* Controls bar */}
				<div className="flex items-center gap-3 px-4 py-2 bg-white/5 border-t border-b border-white/10 flex-shrink-0">
					<button
						onClick={() =>
							currentIndex > 0 &&
							playTrack(allItems[currentIndex - 1])
						}
						disabled={currentIndex <= 0}
						className="px-3 py-1 rounded text-sm bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
						◀ Prev
					</button>
					<span className="text-xs text-white/25 flex-1 font-mono truncate">
						{activeYt ?? '—'}
					</span>
					<button
						onClick={() =>
							currentIndex < allItems.length - 1 &&
							playTrack(allItems[currentIndex + 1])
						}
						disabled={currentIndex >= allItems.length - 1}
						className="px-3 py-1 rounded text-sm bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
						Next ▶
					</button>
				</div>

				{/* Track list */}
				<div className="flex-1 overflow-y-auto px-4 py-3">
					{activeGenre && (
						<>
							{activeGenre.tracks.length > 0 && (
								<div className="mb-4">
									<div className="text-[10px] uppercase tracking-widest text-white/20 mb-2">
										Tracks
									</div>
									{activeGenre.tracks.map((id, i) => (
										<div
											key={id}
											onClick={() => playTrack(id)}
											className={`flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
												id === activeYt
													? 'bg-purple-800/40 text-purple-200'
													: 'text-white/55 hover:bg-white/5 hover:text-white'
											}`}>
											<span className="text-white/20 w-5 text-xs text-right flex-shrink-0">
												{i + 1}
											</span>
											<span className="font-mono text-xs truncate">
												{id}
											</span>
											{id === activeYt && (
												<span className="text-purple-400 ml-auto flex-shrink-0 text-xs">
													♪
												</span>
											)}
										</div>
									))}
								</div>
							)}
							{activeGenre.sets.length > 0 && (
								<div>
									<div className="text-[10px] uppercase tracking-widest text-white/20 mb-2">
										Sets / Radio
									</div>
									{activeGenre.sets.map((id, i) => (
										<div
											key={id}
											onClick={() => playTrack(id)}
											className={`flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
												id === activeYt
													? 'bg-purple-800/40 text-purple-200'
													: 'text-white/55 hover:bg-white/5 hover:text-white'
											}`}>
											<span className="text-purple-400/50 w-5 text-xs text-right flex-shrink-0">
												▶
											</span>
											<span className="font-mono text-xs truncate">
												{id}
											</span>
											{id === activeYt && (
												<span className="text-purple-400 ml-auto flex-shrink-0 text-xs">
													♪
												</span>
											)}
										</div>
									))}
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
