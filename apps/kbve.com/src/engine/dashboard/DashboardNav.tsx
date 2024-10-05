import React, { useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useStore } from '@nanostores/react';
import { $profileStore } from '@kbve/laser';
import DashboardNavigationButton from './components/DashboardNavigationButton';

const DashboardNav: React.FC = () => {
	const [isNavOpen, setIsNavOpen] = useState(false);
	const $profile$ = useStore($profileStore);

	const toggleNav = () => {
		setIsNavOpen(!isNavOpen);
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
							{`Good to see you,  ${$profile$.username}! Your dashboard is waiting...`}
						</span>
					</div>

					<button
						type="button"
						className={twMerge(
							'hs-collapse-toggle sm:hidden py-1.5 px-2 inline-flex items-center font-medium text-xs rounded-md border border-gray-200 bg-white text-gray-800 shadow-sm',
							'hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-neutral-800 focus:outline-none focus:bg-gray-100',
							'dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:focus:bg-neutral-700',
						)}
						onClick={toggleNav}
						aria-controls="hs-nav-secondary"
						aria-label="Toggle navigation">
						Overview
						<svg
							className={clsx(
								'hs-dropdown-open:rotate-180 shrink-0 size-4 ms-1 transition-transform',
								isNavOpen && 'rotate-180',
							)}
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round">
							<path d="m6 9 6 6 6-6" />
						</svg>
					</button>
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
						<DashboardNavigationButton text="Overview" href="#" />
                        <DashboardNavigationButton text="Resources" href="#" />
                        <DashboardNavigationButton text="Logout" href="/logout" />


					</div>
				</div>
			</div>
		</nav>
	);
};

export default DashboardNav;
