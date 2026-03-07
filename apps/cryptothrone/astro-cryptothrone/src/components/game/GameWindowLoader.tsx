import { lazy, Suspense } from 'react';

const GameWindow = lazy(() => import('./GameWindow'));

export default function GameWindowLoader() {
	return (
		<Suspense
			fallback={
				<div
					className="flex justify-center items-center w-full h-full text-white"
					style={{ background: 'var(--ct-bg-deep, #1a1a2e)' }}>
					Loading game…
				</div>
			}>
			<GameWindow />
		</Suspense>
	);
}
