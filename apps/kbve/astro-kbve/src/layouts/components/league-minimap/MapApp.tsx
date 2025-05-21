/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import DrawSVGPlugin from 'gsap/DrawSVGPlugin';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(DrawSVGPlugin, useGSAP);

const STAGES = ['read', 'map', 'home'] as const;
type Stage = (typeof STAGES)[number];

const BG_IMAGES: Record<Stage, string> = {
	read: 'https://images.unsplash.com/photo-1547700055-b61cacebece9?q=80&w=3540&auto=format&fit=crop&',
	map: 'https://images.unsplash.com/photo-1576173992415-e0ca34dc0a8a?q=80&w=3540&auto=format&fit=crop&',
	home: 'https://images.unsplash.com/photo-1693712001391-6aaab1f53d29?q=80&w=3540&auto=format&fit=crop&'
};

export default function MapApp() {
	const [stageIndex, setStageIndex] = useState(0);
	const stage = STAGES[stageIndex];

	const shapeRefs = useRef<SVGPathElement[][]>([[], [], [], []]);
	const textRef = useRef<HTMLDivElement>(null);
	const bgContainerRef = useRef<HTMLDivElement>(null);

	const transitionToNextStage = () => {
		const nextIndex = (stageIndex + 1) % STAGES.length;
		setStageIndex(nextIndex);
		animateStageTransition(STAGES[nextIndex]);
	};

	useEffect(() => {
		animateStageTransition(stage);
	}, []);

	const animateStageTransition = (nextStage: Stage) => {
		const container = bgContainerRef.current;
		if (!container) return;

		const newImage = document.createElement('img');
		newImage.src = BG_IMAGES[nextStage];
		newImage.className = 'absolute inset-0 w-full h-full object-cover';
		newImage.style.opacity = '0';
		container.appendChild(newImage);

		gsap.to(newImage, {
			opacity: 0.1,
			scale: 1,
			rotate: 0,
			duration: 1.5,
			transformOrigin: 'center',
			ease: 'power4.out',
			onComplete: () => {
				Array.from(container.children).forEach((child, idx, arr) => {
					if (idx < arr.length - 1) container.removeChild(child);
				});
			}
		});
	};

	useGSAP(() => {
		const paths = shapeRefs.current.flat();
		paths.forEach((path) => {
			const length = path.getTotalLength();
			gsap.set(path, {
				drawSVG: '0% 0%',
				strokeDasharray: length,
				strokeDashoffset: length
			});
			gsap.to(path, {
				drawSVG: '100%',
				duration: 2,
				ease: 'power2.out',
				stagger: 0.1
			});
		});
	}, []);

	return (
		<div className="relative bg-black text-white overflow-hidden">
			<div ref={bgContainerRef} className="absolute inset-0 z-0">
				<img
					src={BG_IMAGES[stage]}
					className="absolute inset-0 w-full h-full object-cover opacity-10"
					alt="Background"
				/>
			</div>

			<div className="relative z-10 p-8 max-w-6xl mx-auto">
				<svg
					className="w-full max-w-4xl mx-auto"
					viewBox="0 0 1054.9 703.6"
					xmlns="http://www.w3.org/2000/svg">
					{[0, 1, 2, 3].map((groupIdx) => (
						<g key={`g${groupIdx}`} id={`g${groupIdx + 1}`}> 
							<path
								ref={(el) => el && shapeRefs.current[groupIdx].push(el)}
								d="M100 100 C200 50, 300 150, 400 100"
								stroke={groupIdx % 2 === 0 ? '#06b6d4' : '#a855f7'}
								fill="none"
								strokeWidth="5"
							/>
						</g>
					))}
				</svg>

				<div ref={textRef} className="mt-8 text-center space-y-4">
					<h1 className="text-4xl font-bold">Welcome to KBVE</h1>
					<p className="text-zinc-300 max-w-xl mx-auto">
						Explore our interactive map or read more about our vision.
					</p>
				</div>

				<div className="mt-6 text-center">
					<button
						onClick={transitionToNextStage}
						className="px-6 py-3 rounded-lg border-2 border-cyan-500 text-white hover:bg-cyan-500 transition-all">
						{stage === 'read' && 'Read More >'}
						{stage === 'map' && 'See Map'}
						{stage === 'home' && 'Return Home'}
					</button>
				</div>
			</div>
		</div>
	);
}
