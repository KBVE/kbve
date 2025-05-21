/** @jsxImportSource react */
import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function MapApp() {
	const [screen, setScreen] = useState(0);
	const [stage, setStage] = useState<'read' | 'map' | 'home'>('read');

	const shapeRefs = useRef<SVGPathElement[][]>([[], [], [], []]);
	const textRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const bgRef = useRef<HTMLImageElement>(null);

	const stageBg = {
		read: 'https://images.unsplash.com/photo-1547700055-b61cacebece9?q=80&w=3540&auto=format&fit=crop&',
		map: 'https://images.unsplash.com/photo-1618005198919-d3d4d5e4893b?q=80&w=3540&auto=format&fit=crop&',
		home: 'https://images.unsplash.com/photo-1589405858861-d8570b7dc63e?q=80&w=3540&auto=format&fit=crop&'
	};

	useLayoutEffect(() => {
		shapeRefs.current = [[], [], [], []];
		requestAnimationFrame(() => {
			const allPaths = shapeRefs.current.flat();
			allPaths.forEach((path) => {
				const length = path.getTotalLength();
				path.style.strokeDasharray = `${length}`;
				path.style.strokeDashoffset = `${length}`;
				gsap.to(path, {
					strokeDashoffset: 0,
					duration: 1.5,
					ease: 'power2.out'
				});
			});
		});
	}, []);

	const animateBackgroundTransition = (nextStage: typeof stage) => {
		const nextImage = new Image();
		nextImage.src = stageBg[nextStage];
		nextImage.className = 'absolute inset-0 w-full h-full object-cover';
		nextImage.style.opacity = '0';
		nextImage.style.transform = 'scale(0.9) rotate(-12deg)';
		nextImage.style.zIndex = '-2';

		const container = bgRef.current?.parentElement;
		if (container && bgRef.current) {
			container.appendChild(nextImage);

			gsap.to(bgRef.current, {
				opacity: 0,
				scale: 1.1,
				rotate: 10,
				duration: 1.2,
				ease: 'power3.inOut',
                onComplete: () => {
                    const current = bgRef.current;
                    if (current && container.contains(current)) {
                        container.removeChild(current);
                        bgRef.current = nextImage;

                        gsap.set(nextImage, { opacity: 0.0, scale: 0.9, rotate: -12 });
                        gsap.to(nextImage, {
                            opacity: 0.1,
                            scale: 1,
                            rotate: 0,
                            duration: 1.2,
                            ease: 'power3.out'
                        });
                    }
                }
			});
		}
	};

	const toggleShape = () => {
		const next = (screen + 1) % 3;
		const nextStage = ['read', 'map', 'home'][next] as typeof stage;
		animateBackgroundTransition(nextStage);
		setStage(nextStage);
		setScreen(next);

		if (next === 1) runFireAnimation();
		if (next === 2) runMapAnimation();
		if (next === 0) resetAnimation();
	};

	const runFireAnimation = () => {
		if (textRef.current) {
			gsap.to(textRef.current, {
				y: -40,
				opacity: 1,
				duration: 1,
				ease: 'power2.out'
			});
		}
		shapeRefs.current.flat().forEach((path, i) => {
			const length = path.getTotalLength();
			gsap.fromTo(
				path,
				{ strokeDashoffset: length },
				{ strokeDashoffset: 0, duration: 1, delay: i * 0.05, ease: 'sine.out' }
			);
		});
	};

	const runMapAnimation = () => {
		if (textRef.current) {
			gsap.to(textRef.current, {
				x: 30,
				y: 50,
				duration: 1,
				ease: 'back.out(1.7)'
			});
		}
		gsap.to(shapeRefs.current.flat(), {
			scale: 1.5,
			opacity: 0.75,
			duration: 1,
			transformOrigin: 'center',
			ease: 'power2.out'
		});
	};

	const resetAnimation = () => {
		if (textRef.current) {
			gsap.to(textRef.current, {
				x: 0,
				y: 0,
				opacity: 1,
				duration: 0.5,
				ease: 'power1.inOut'
			});
		}
		gsap.to(shapeRefs.current.flat(), {
			scale: 1,
			opacity: 1,
			duration: 0.5,
			ease: 'sine.inOut'
		});
	};

	return (
		<div className="relative text-white p-6 overflow-hidden">
			<div className="absolute inset-0 z-[-1] overflow-hidden">
				<img
					src={stageBg[stage]}
					ref={bgRef}
					className="w-full h-full object-cover opacity-10"
				/>
			</div>

			<svg
				className="w-full max-w-4xl mx-auto"
				viewBox="0 0 1054.9 703.6"
				xmlns="http://www.w3.org/2000/svg">
				{[0, 1, 2, 3].map((groupIdx) => (
					<g key={`g${groupIdx}`} id={`g${groupIdx + 1}`}>
						<path
							key={`path-${groupIdx}`}
							ref={(el) => el && shapeRefs.current[groupIdx].push(el)}
							d="M100 100 C200 50, 300 150, 400 100"
							stroke={groupIdx % 2 === 0 ? '#06b6d4' : '#a855f7'}
							fill="none"
							strokeWidth="5"
						/>
					</g>
				))}
			</svg>

			<div
				ref={textRef}
				className="mt-8 text-center space-y-4 transition-transform duration-300">
				<h1 className="text-3xl font-bold">Welcome to KBVE</h1>
				<p className="text-zinc-400">
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum.
				</p>
			</div>

			<div className="mt-6 text-center">
				<button
					ref={buttonRef}
					onClick={toggleShape}
					className="px-6 py-2 rounded-lg border-2 border-cyan-500 text-white hover:bg-cyan-500 transition-all">
					<span className={`read ${stage === 'read' ? 'inline-block' : 'hidden'}`}>Read More &gt;</span>
					<span className={`share ${stage === 'map' ? 'inline-block' : 'hidden'}`}>See Map</span>
					<span className={`home ${stage === 'home' ? 'inline-block' : 'hidden'}`}>Return Home</span>
				</button>
			</div>
		</div>
	);
}