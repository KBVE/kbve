/** @jsxImportSource react */
import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';

const BG_IMAGES = [
	'https://images.unsplash.com/photo-1547700055-b61cacebece9?q=80&w=3540&auto=format&fit=crop&',
	'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=3540&auto=format&fit=crop&',
];

export default function MapApp() {
	const [screen, setScreen] = useState(0);
	const [stage, setStage] = useState<'read' | 'map' | 'home'>('read');

	const shapeRefs = useRef<SVGPathElement[][]>([[], [], [], []]);
	const textRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const bgRef = useRef<HTMLImageElement | null>(null);
	const bgContainerRef = useRef<HTMLDivElement>(null);

	// Initial stroke draw animation
	useLayoutEffect(() => {
		shapeRefs.current = [[], [], [], []]; // reset

		const allPaths = shapeRefs.current.flat();
		allPaths.forEach((path) => {
			const length = path.getTotalLength();
			path.style.strokeDasharray = `${length}`;
			path.style.strokeDashoffset = `${length}`;
			gsap.to(path, {
				strokeDashoffset: 0,
				duration: 1.5,
				ease: 'power2.out',
			});
		});

		// Inject first background
		const initialImage = createBackgroundImage(BG_IMAGES[0]);
		bgRef.current = initialImage;
		bgContainerRef.current?.appendChild(initialImage);
	}, []);

	const toggleShape = () => {
		const next = (screen + 1) % 3;
		setScreen(next);
		if (next === 1) runFireAnimation();
		if (next === 2) runMapAnimation();
		if (next === 0) resetAnimation();
	};

	const transitionBackground = (src: string) => {
		const container = bgContainerRef.current;
		if (!container) return;

		const oldImage = bgRef.current;
		const newImage = createBackgroundImage(src);

		container.appendChild(newImage);

		gsap.set(newImage, {
			opacity: 0,
			scale: 0.9,
			rotate: -12,
		});

		// Animate old out
		if (oldImage) {
			gsap.to(oldImage, {
				opacity: 0,
				scale: 1.1,
				rotate: 12,
				duration: 1.2,
				ease: 'power3.in',
				onComplete: () => {
					if (container.contains(oldImage)) {
						container.removeChild(oldImage);
					}
				},
			});
		}

		// Animate new in
		gsap.to(newImage, {
			opacity: 0.1,
			scale: 1,
			rotate: 0,
			duration: 1.2,
			ease: 'power3.out',
		});
	};

	const createBackgroundImage = (src: string): HTMLImageElement => {
		const img = new Image();
		img.src = src;
		img.style.position = 'absolute';
		img.style.top = '0';
		img.style.left = '0';
		img.style.width = '100%';
		img.style.height = '100%';
		img.style.objectFit = 'cover';
		img.style.opacity = '0.1';
		img.style.pointerEvents = 'none';
		img.style.zIndex = '0';
		return img;
	};

	const runFireAnimation = () => {
		setStage('map');
		transitionBackground(BG_IMAGES[1]);

		if (textRef.current) {
			gsap.to(textRef.current, {
				y: -40,
				opacity: 1,
				duration: 1,
				ease: 'power2.out',
			});
		}

		shapeRefs.current.flat().forEach((path, i) => {
			const length = path.getTotalLength();
			gsap.fromTo(
				path,
				{ strokeDashoffset: length },
				{
					strokeDashoffset: 0,
					duration: 1,
					delay: i * 0.05,
					ease: 'sine.out',
				}
			);
		});
	};

	const runMapAnimation = () => {
		setStage('home');
		transitionBackground(BG_IMAGES[0]);

		if (textRef.current) {
			gsap.to(textRef.current, {
				x: 30,
				y: 50,
				duration: 1,
				ease: 'back.out(1.7'),
			});
		}

		gsap.to(shapeRefs.current.flat(), {
			scale: 1.5,
			opacity: 0.75,
			duration: 1,
			transformOrigin: 'center',
			ease: 'power2.out',
		});
	};

	const resetAnimation = () => {
		setStage('read');
		transitionBackground(BG_IMAGES[0]);

		if (textRef.current) {
			gsap.to(textRef.current, {
				x: 0,
				y: 0,
				opacity: 1,
				duration: 0.5,
				ease: 'power1.inOut',
			});
		}

		gsap.to(shapeRefs.current.flat(), {
			scale: 1,
			opacity: 1,
			duration: 0.5,
			ease: 'sine.inOut',
		});
	};

	return (
		<div className="relative text-white overflow-hidden">
			{/* Background image container */}
			<div
				ref={bgContainerRef}
				className="absolute inset-0 z-0"
				style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
			/>

			{/* Foreground content */}
			<div className="relative z-10 p-6">
				<svg
					className="w-full max-w-4xl mx-auto"
					viewBox="0 0 1054.9 703.6"
					xmlns="http://www.w3.org/2000/svg">
					{[0, 1, 2, 3].map((groupIdx) => (
						<g key={`g${groupIdx}`} id={`g${groupIdx + 1}`}>
							<path
								key={`path-${groupIdx}`}
								ref={(el) =>
									el &&
									shapeRefs.current[groupIdx].push(el)
								}
								d="M100 100 C200 50, 300 150, 400 100"
								stroke={
									groupIdx % 2 === 0
										? '#06b6d4'
										: '#a855f7'
								}
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
					<p className="text-zinc-300">
						Lorem ipsum dolor sit amet, consectetur adipiscing elit.
						Vivamus lacinia odio vitae vestibulum.
					</p>
				</div>

				<div className="mt-6 text-center">
					<button
						ref={buttonRef}
						onClick={toggleShape}
						className="px-6 py-2 rounded-lg border-2 border-cyan-500 text-white hover:bg-cyan-500 transition-all">
						<span
							className={`read ${
								stage === 'read' ? 'inline-block' : 'hidden'
							}`}>
							Read More &gt;
						</span>
						<span
							className={`share ${
								stage === 'map' ? 'inline-block' : 'hidden'
							}`}>
							See Map
						</span>
						<span
							className={`home ${
								stage === 'home' ? 'inline-block' : 'hidden'
							}`}>
							Return Home
						</span>
					</button>
				</div>
			</div>
		</div>
	);
