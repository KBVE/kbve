import React, { useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useStore } from '@nanostores/react';

import {
	eventEmitterInstance,
	type NPCInteractionEventData,
} from '@kbve/laser';

interface FancyButtonProps {
	onClick: () => void;
	children: React.ReactNode;
}

const FancyButton: React.FC<FancyButtonProps> = ({ onClick, children }) => {
	return (
		<button
			onClick={onClick}
			className="relative inline-block text-lg group">
			<span className="relative z-10 block px-5 py-3 overflow-hidden font-medium leading-tight text-gray-800 transition-colors duration-300 ease-out border-2 border-gray-900 rounded-lg group-hover:text-white">
				<span className="absolute inset-0 w-full h-full px-5 py-3 rounded-lg bg-gray-50"></span>
				<span className="absolute left-0 w-48 h-48 -ml-2 transition-all duration-300 origin-top-right -rotate-90 -translate-x-full translate-y-12 bg-gray-900 group-hover:-rotate-180 ease"></span>
				<span className="relative">{children}</span>
			</span>
			<span
				className="absolute bottom-0 right-0 w-full h-12 -mb-1 -mr-1 transition-all duration-200 ease-linear bg-gray-900 rounded-lg group-hover:mb-0 group-hover:mr-0"
				data-rounded="rounded-lg"></span>
		</button>
	);
};

const KanbanMenu: React.FC = () => {
	const [isNavOpen, setIsNavOpen] = useState(false);

	const toggleNav = () => {
		setIsNavOpen(!isNavOpen);
	};

	/**
     * 
     * 	npcId: string;
	npcName: string;
	actions: string[];
	data?: T;
	coords: {
		x: number;
		y: number;
	};
     */

	const handleResetButton = () => {
		console.log('Button clicked!');
		eventEmitterInstance.emit('npcInteraction', {
			npcId: 'Reset',
			npcName: 'Reset',
			actions: ['clear'],
			coords: { x: 0, y: 0 },
		});
	};

	return (
		<nav
			className={twMerge(
				'bg-yellow-50/60 dark:bg-neutral-900  border-dashed hover:border-double border-2 border-cyan-500',
			)}>
			<div
				className={twMerge(
					'max-w-[85rem] w-full mx-auto sm:flex sm:flex-row sm:justify-between sm:items-center sm:gap-x-3 py-3 px-4 sm:px-6 lg:px-8',
				)}>
				<div
					className={twMerge(
						'flex justify-between items-center gap-x-3',
					)}>
					<div className={twMerge('grow')}>
						<span
							className={twMerge(
								'font-semibold whitespace-nowrap text-gray-800 dark:text-neutral-200',
							)}>
							{`Good to see you!`}
						</span>
					</div>
				</div>

				<div
					id="hs-nav-secondary"
					className={twMerge(
						'hs-collapse overflow-hidden transition-all duration-300 basis-full grow sm:block',
						isNavOpen ? 'block' : 'hidden',
					)}>
					<div
						className={twMerge(
							'py-3 sm:py-0 flex flex-col sm:flex-row sm:justify-end gap-y-2 sm:gap-y-0 sm:gap-x-6',
						)}>
						<FancyButton onClick={handleResetButton}>Reset</FancyButton>
					</div>
				</div>
			</div>
		</nav>
	);
};

export default KanbanMenu;
