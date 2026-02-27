export default function FeedSkeleton() {
	return (
		<div
			className="flex flex-col items-center justify-center gap-6"
			style={{
				height: '100dvh',
				backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
			}}>
			{/* Image placeholder */}
			<div
				className="w-3/4 max-w-md rounded-xl animate-pulse"
				style={{
					height: '55%',
					backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
				}}
			/>

			{/* Title bar */}
			<div className="w-3/4 max-w-md flex flex-col gap-2">
				<div
					className="h-4 w-3/4 rounded animate-pulse"
					style={{
						backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
					}}
				/>
				<div className="flex items-center gap-2">
					<div
						className="w-6 h-6 rounded-full animate-pulse"
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

			{/* Right-side reaction placeholder */}
			<div className="absolute right-4 bottom-1/4 flex flex-col gap-4">
				{[...Array(4)].map((_, i) => (
					<div
						key={i}
						className="w-10 h-10 rounded-full animate-pulse"
						style={{
							backgroundColor:
								'var(--sl-color-gray-6, #1c1c1e)',
						}}
					/>
				))}
			</div>
		</div>
	);
}
