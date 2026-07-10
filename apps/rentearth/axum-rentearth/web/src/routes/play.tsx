import { useEffect, useRef, useState } from 'react';

const ARPG_ORIGIN =
	import.meta.env.PUBLIC_ARPG_ORIGIN ?? 'https://arpg.kbve.com';
const EMBED_SRC = `${ARPG_ORIGIN}/arpg-embed.js`;
const CONTAINER_ID = 'iso-arpg-container';

function loadEmbed(): Promise<ArpgEmbedApi> {
	if (window.ArpgEmbed) return Promise.resolve(window.ArpgEmbed);
	return new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(
			`script[src="${EMBED_SRC}"]`,
		);
		const onReady = () => {
			if (window.ArpgEmbed) resolve(window.ArpgEmbed);
			else reject(new Error('embed loaded but ArpgEmbed missing'));
		};
		if (existing) {
			existing.addEventListener('load', onReady, { once: true });
			existing.addEventListener('error', () => reject(new Error('embed load failed')), {
				once: true,
			});
			return;
		}
		const script = document.createElement('script');
		script.src = EMBED_SRC;
		script.crossOrigin = 'anonymous';
		script.addEventListener('load', onReady, { once: true });
		script.addEventListener('error', () => reject(new Error('embed load failed')), {
			once: true,
		});
		document.head.appendChild(script);
	});
}

export function PlayPage() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		document.body.classList.add('arpg-play');
		let cancelled = false;
		loadEmbed()
			.then((api) => {
				if (cancelled || !containerRef.current) return;
				api.mountApp({ el: containerRef.current, assetBase: ARPG_ORIGIN });
			})
			.catch(() => {
				if (!cancelled) setError(true);
			});
		return () => {
			cancelled = true;
			document.body.classList.remove('arpg-play');
		};
	}, []);

	return (
		<div className="fixed inset-0 z-[9999] bg-[#10131c]">
			<div
				id={CONTAINER_ID}
				ref={containerRef}
				tabIndex={0}
				className="h-full w-full focus:outline-none"
				style={{ containerType: 'size' }}
			/>
			{error && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
					<p className="text-red-400">Game failed to load.</p>
					<a
						href="/"
						className="rounded-lg bg-violet-500 px-4 py-2 font-semibold text-black hover:bg-violet-400">
						Back to home
					</a>
				</div>
			)}
		</div>
	);
}
