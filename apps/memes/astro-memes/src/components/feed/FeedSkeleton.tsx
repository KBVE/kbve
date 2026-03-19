interface FeedSkeletonProps {
	variant?: 'mobile' | 'desktop';
}

export default function FeedSkeleton({
	variant = 'mobile',
}: FeedSkeletonProps) {
	if (variant === 'desktop') {
		const aspects = [
			'16 / 9',
			'4 / 3',
			'3 / 4',
			'4 / 3',
			'1 / 1',
			'4 / 3',
			'3 / 4',
			'16 / 9',
		];
		return (
			<div
				className="w-full min-h-screen px-3 md:px-6 lg:px-8 py-6 md:py-10"
				style={{ backgroundColor: '#0c0c0e' }}>
				<div
					className="max-w-7xl mx-auto"
					style={{
						columns: 'auto',
						columnCount: 'auto',
						columnWidth: '280px',
						columnGap: '12px',
					}}>
					{aspects.map((aspect, i) => (
						<div
							key={i}
							style={{
								breakInside: 'avoid',
								marginBottom: '12px',
							}}>
							<div
								className="rounded-xl overflow-hidden"
								style={{
									aspectRatio: aspect,
									background:
										'linear-gradient(110deg, #161618 30%, #1e1e21 50%, #161618 70%)',
									backgroundSize: '200% 100%',
									animation:
										'shimmer 1.5s ease-in-out infinite',
									animationDelay: `${i * 80}ms`,
								}}
							/>
						</div>
					))}
				</div>
				<style>{`
					@keyframes shimmer {
						0% { background-position: 200% 0; }
						100% { background-position: -200% 0; }
					}
					@media (prefers-reduced-motion: reduce) {
						* { animation-duration: 0.01ms !important; }
					}
				`}</style>
			</div>
		);
	}

	return (
		<div
			className="relative flex flex-col items-center justify-center gap-6"
			style={{
				height: '100dvh',
				backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
			}}>
			{/* Image placeholder — matches constrained card layout */}
			<div
				className="w-[85%] max-w-lg rounded-xl animate-pulse"
				style={{
					height: '55%',
					backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
					border: '1px solid rgba(255,255,255,0.04)',
				}}
			/>

			{/* Bottom info bar */}
			<div className="absolute bottom-0 left-0 right-0 p-4 pb-6">
				<div className="flex flex-col gap-2.5 max-w-lg">
					<div
						className="h-4 w-3/4 rounded animate-pulse"
						style={{
							backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
						}}
					/>
					<div className="flex items-center gap-2">
						<div
							className="w-8 h-8 rounded-full animate-pulse"
							style={{
								backgroundColor:
									'var(--sl-color-gray-6, #1c1c1e)',
							}}
						/>
						<div
							className="h-3 w-20 rounded animate-pulse"
							style={{
								backgroundColor:
									'var(--sl-color-gray-6, #1c1c1e)',
							}}
						/>
					</div>
				</div>
			</div>

			{/* Right-side reaction bar placeholder */}
			<div
				className="absolute right-3 bottom-28 flex flex-col items-center gap-2.5 rounded-2xl p-2.5"
				style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
				{[...Array(4)].map((_, i) => (
					<div
						key={i}
						className="w-10 h-10 rounded-full animate-pulse"
						style={{
							backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
						}}
					/>
				))}
			</div>
		</div>
	);
}
