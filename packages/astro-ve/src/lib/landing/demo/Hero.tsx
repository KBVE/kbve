import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import twMerge from 'tailwind-merge';

const defaultVariants = {
	enter: (direction: number) => ({
		transform: `perspective(600px) ${direction > 0 ? 'rotateY(90deg)' : 'rotateY(-90deg)'} rotateX(0deg) translateZ(0px)`,
		opacity: 0,
		scale: 0.75,
	}),
	center: {
		transform:
			'perspective(600px) rotateY(0deg) rotateX(0deg) translateZ(0px)',
		zIndex: 1,
		opacity: 1,
		scale: 1,
	},
	exit: (direction: number) => ({
		transform: `perspective(600px) ${direction < 0 ? 'rotateY(90deg)' : 'rotateY(-90deg)'} rotateX(0deg) translateZ(0px)`,
		zIndex: 0,
		opacity: 0,
		scale: 0.75,
	}),
};

type ComponentConfig = {
	Component: React.ComponentType;
	animation?: {
		enter: object;
		center: object;
		exit: object;
	};
};

type HeroProps = {
	components: ComponentConfig[];
};

const Hero: React.FC<HeroProps> = ({ components }) => {
	const [[page, direction], setPage] = useState<[number, number]>([0, 0]);
	const [isHovering, setIsHovering] = useState(false);

	const paginate = (newDirection: number) => {
		setPage([page + newDirection, newDirection]);
	};

	useEffect(() => {
		const interval = setInterval(() => {
			if (!isHovering) {
				paginate(1); // Automatically paginate to the next component
			}
		}, 10000); // Change slide every 10 seconds

		return () => clearInterval(interval);
	}, [page, isHovering]);

	const index = page % components.length;
	const { Component, animation } = components[index];

	// Use provided animation or default if none provided
	const mergedVariants = {
		enter: animation?.enter || defaultVariants.enter(direction),
		center: animation?.center || defaultVariants.center,
		exit: animation?.exit || defaultVariants.exit(direction),
	};

	return (
		<div
			className="relative w-full h-96 overflow-hidden"
			onMouseEnter={() => setIsHovering(true)}
			onMouseLeave={() => setIsHovering(false)}>
			<AnimatePresence initial={false} custom={direction}>
				<motion.div
					key={page}
					custom={direction}
					variants={mergedVariants}
					initial="enter"
					animate="center"
					exit="exit"
					transition={{
						transform: {
							duration: 1.2,
							ease: [0.68, -0.55, 0.265, 1.55],
						},
						opacity: { duration: 0.8, ease: 'easeOut' },
					}}
					className={clsx('absolute w-full h-full')}>
					<Component />
				</motion.div>
			</AnimatePresence>
			<button
				className={clsx(
					'absolute top-1/2 left-5 transform -translate-y-1/2 z-20',
					'bg-cyan-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded',
				)}
				onClick={() => paginate(-1)}>
				←
			</button>
			<button
				className={clsx(
					'absolute top-1/2 right-5 transform -translate-y-1/2 z-20',
					'bg-cyan-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded',
				)}
				onClick={() => paginate(1)}>
				→
			</button>
		</div>
	);
};

export default Hero;
