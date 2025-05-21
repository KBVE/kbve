/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function MapApp() {
	const [screen, setScreen] = useState(0);
	const shapeRefs = useRef<SVGPathElement[][]>([[], [], [], []]);
	const textRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	//const boxRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const allPaths = shapeRefs.current.flat();
		allPaths.forEach((path) => {
			const length = path.getTotalLength();
			path.style.strokeDasharray = `${length}`;
			path.style.strokeDashoffset = `${length}`;
			path.style.transition = 'stroke-dashoffset 1s ease-out';
			path.getBoundingClientRect();
			path.style.strokeDashoffset = '0';
		});
	}, []);

	const toggleShape = () => {
		const next = (screen + 1) % 3;
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
				ease: 'power2.out',
			});
		}

		if (buttonRef.current?.children[0]) {
			gsap.to(buttonRef.current.children[0], { opacity: 0 });
		}

		if (buttonRef.current?.children[1]) {
			gsap.to(buttonRef.current.children[1], { opacity: 1 });
		}
	};

	const runMapAnimation = () => {
		if (textRef.current) {
			gsap.to(textRef.current, {
				x: 30,
				y: 50,
				duration: 1,
				ease: 'back.out(1.7)',
			});
		}

		if (buttonRef.current?.children[1]) {
			gsap.to(buttonRef.current.children[1], { opacity: 0 });
		}

		if (buttonRef.current?.children[2]) {
			gsap.to(buttonRef.current.children[2], { opacity: 1 });
		}
	};

	const resetAnimation = () => {
		if (textRef.current) {
			gsap.to(textRef.current, {
				x: 0,
				y: 0,
				opacity: 1,
				duration: 0.5,
				ease: 'power1.inOut',
			});
		}

		if (buttonRef.current?.children[2]) {
			gsap.to(buttonRef.current.children[2], { opacity: 0 });
		}

		if (buttonRef.current?.children[0]) {
			gsap.to(buttonRef.current.children[0], { opacity: 1 });
		}
	};

	return (
		<div className="relative bg-black text-white p-6">
			<svg
				className="w-full max-w-4xl mx-auto"
				viewBox="0 0 1054.9 703.6"
				xmlns="http://www.w3.org/2000/svg">
				{[0, 1, 2, 3].map((groupIdx) => (
					<g key={groupIdx} id={`g${groupIdx + 1}`}>
						<path
							ref={(el) =>
								el && shapeRefs.current[groupIdx].push(el)
							}
							d="M100 100 C200 50, 300 150, 400 100"
							stroke={groupIdx % 2 === 0 ? '#06b6d4' : '#a855f7'}
							fill="none"
							strokeWidth="5"
						/>
					</g>
				))}
			</svg>

			<div ref={textRef} className="mt-8 text-center space-y-4">
				<h1 className="text-3xl font-bold">Welcome to KBVE</h1>
				<p className="text-zinc-400">
					Lorem ipsum dolor sit amet, consectetur adipiscing elit.
					Vivamus lacinia odio vitae vestibulum.
				</p>
			</div>

			<div className="mt-6 text-center">
				<button
					ref={buttonRef}
					onClick={toggleShape}
					className="px-6 py-2 rounded-lg border-2 border-cyan-500 text-white hover:bg-cyan-500 transition-all">
					<span className="read inline-block">Read More &gt;</span>
					<span className="share hidden">See Map</span>
					<span className="home hidden">Return Home</span>
				</button>
			</div>
		</div>
	);
}
