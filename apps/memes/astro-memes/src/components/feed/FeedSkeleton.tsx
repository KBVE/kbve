interface FeedSkeletonProps {
	variant?: 'mobile' | 'desktop';
}

export default function FeedSkeleton({
	variant = 'mobile',
}: FeedSkeletonProps) {
	if (variant === 'desktop') {
		return (
			<div
				className="w-full min-h-screen px-4 md:px-6 lg:px-8 py-8"
				style={{
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
				}}>
				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 max-w-7xl mx-auto">
					{[...Array(8)].map((_, i) => (
						<div
							key={i}
							className={`rounded-2xl overflow-hidden ${
								i % 7 === 3
									? 'md:col-span-2 aspect-video'
									: 'aspect-[4/3]'
							}`}
							style={{
								background:
									'linear-gradient(110deg, var(--sl-color-gray-6, #1c1c1e) 30%, var(--sl-color-gray-5, #27272a) 50%, var(--sl-color-gray-6, #1c1c1e) 70%)',
								backgroundSize: '200% 100%',
								animation: 'shimmer 1.5s ease-in-out infinite',
								animationDelay: `${i * 80}ms`,
								border: '1px solid rgba(255,255,255,0.04)',
							}}
						/>
					))}
				</div>
				<style>{`
					@keyframes shimmer {
						0% { background-position: 200% 0; }
						100% { background-position: -200% 0; }
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
