import { lazy, Suspense } from 'react';

const GameWindow = lazy(() => import('./GameWindow'));

export default function GameWindowLoader() {
	return (
		<Suspense
			fallback={
				<div className="flex justify-center items-center w-full h-[600px] bg-[#1a1a2e] text-white">
					Loading game…
				</div>
			}>
			<GameWindow />
		</Suspense>
	);
}
