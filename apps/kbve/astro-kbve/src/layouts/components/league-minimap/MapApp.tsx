/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import DrawSVGPlugin from 'gsap/DrawSVGPlugin';
import { useGSAP } from '@gsap/react';

// NanoStores
import { useStore } from '@nanostores/react';
import { $stage, nextStage, stageDefinitions } from './StageStore';
import type { Stage } from './StageTypes';

// MapAnimator
import { MapAnimator } from './MapAnimator';

// Shapes
import { ShapePaths } from './Shapes';

gsap.registerPlugin(DrawSVGPlugin, useGSAP);

type ShapeRefs = Record<'g1' | 'g2' | 'g3' | 'g4', SVGPathElement[]>;

const groupToLetterMap = (stage: Stage): Record<'g1' | 'g2' | 'g3' | 'g4', string> => {
	const shape = stageDefinitions[stage].shape;
	return {
		g1: shape,
		g2: shape,
		g3: shape,
		g4: shape
	};
};

export default function MapApp() {
	const stage = useStore($stage);
	const shapeRefs = useRef<ShapeRefs>({
		g1: [],
		g2: [],
		g3: [],
		g4: [],
	});
	const textRef = useRef<HTMLDivElement>(null);
	const bgContainerRef = useRef<HTMLDivElement>(null);
	const animatorRef = useRef<MapAnimator | null>(null);

	const clearShapeRefs = () => {
		Object.values(shapeRefs.current).forEach((group) => (group.length = 0));
	};

	const transitionToNextStage = () => {
		nextStage();
	};

	useEffect(() => {
		// Phase 0 + 1 - INIT MapAnimator on mount
		if (!textRef.current || !bgContainerRef.current) return;

		animatorRef.current = new MapAnimator({
			shapeRefs: shapeRefs.current,
			textEl: textRef.current,
			bgContainerEl: bgContainerRef.current,
		});
	}, []);

	useEffect(() => {
		// Phase 2 CLEAR refs on stage change (before SVG collects new ones)
		clearShapeRefs();
	}, [stage]);

	useGSAP(() => {
		if (!animatorRef.current) return;

		const allPathsExist = Object.values(shapeRefs.current).every(
			(group) => group.length > 0,
		);
		if (!allPathsExist) return;

		animatorRef.current.animate(stage); // Phase 3 RE-ANIMATE when stage changes
	}, [stage]);

	return (
		<div className="relative bg-black text-white overflow-hidden">
			<div ref={bgContainerRef} className="absolute inset-0 z-0">
				<img
					src={stageDefinitions[stage].bg}
					className="absolute inset-0 w-full h-full object-cover bg-opacity-75"
					alt="Background"
				/>
			</div>

			<div className="relative z-10 p-8 max-w-6xl mx-auto">
				<svg
					className="w-full max-w-4xl mx-auto"
					viewBox="0 0 1054.9 703.6"
					xmlns="http://www.w3.org/2000/svg">
					{(['g1', 'g2', 'g3', 'g4'] as const).map((groupId, idx) => {
	                    const letter = groupToLetterMap(stage)[groupId];
						const PathComponent = ShapePaths[letter];

						return (
							<g key={groupId} id={groupId}>
								<PathComponent
									ref={(el: SVGPathElement) =>
										el &&
										shapeRefs.current[groupId].push(el)
									}
									stroke={
										idx % 2 === 0 ? '#06b6d4' : '#a855f7'
									}
									fill="none"
									strokeWidth={5}
								/>
							</g>
						);
					})}
				</svg>

				<div ref={textRef} className="mt-8 text-center space-y-4">
                    {stageDefinitions[stage].content}
                </div>

				<div className="mt-6 text-center">
					<button
						onClick={transitionToNextStage}
						className="px-6 py-3 rounded-lg border-2 border-cyan-500 text-white hover:bg-cyan-500 transition-all">
						{stageDefinitions[stage].buttonText}
					</button>
				</div>
			</div>
		</div>
	);
}
