import React, { useState, useEffect } from 'react';
import type { IMapObject } from '@/data/schema/IMapSchema';
import { ServiceMapDB, type TooltipData } from './ServiceMapDB';

interface TooltipProps {
	content: string;
	ariaLabel: string;
	priority: 'low' | 'medium' | 'high';
	isVisible: boolean;
	position: { x: number; y: number };
}

const Tooltip: React.FC<TooltipProps> = ({
	content,
	ariaLabel,
	priority,
	isVisible,
	position,
}) => {
	if (!isVisible) return null;

	const priorityStyles = {
		low: 'bg-gray-800/95 border-gray-600',
		medium: 'bg-blue-800/95 border-blue-600',
		high: 'bg-green-800/95 border-green-600',
	};

	return (
		<div
			role="tooltip"
			aria-label={ariaLabel}
			className={`absolute z-[9999] px-3 py-2 text-sm text-white rounded-lg border backdrop-blur-sm max-w-xs break-words pointer-events-none transition-all duration-200 shadow-lg ${priorityStyles[priority]}`}
			style={{
				left: position.x,
				top: position.y,
				transform: 'translate(-50%, -100%)',
				marginTop: '-10px',
			}}>
			<div className="relative">
				{content}
				{/* Arrow pointing down to the stat */}
				<div
					className={`absolute left-1/2 w-0 h-0 border-l-4 border-r-4 border-t-6 border-transparent ${
						priority === 'high'
							? 'border-t-green-800'
							: priority === 'medium'
								? 'border-t-blue-800'
								: 'border-t-gray-800'
					}`}
					style={{
						bottom: '-6px',
						transform: 'translateX(-50%)',
					}}
				/>
			</div>
		</div>
	);
};

interface ReactMapDBPanelProps {
	data: IMapObject;
}

/**
 * React overlay that adds contextual tooltips to each stat in the static Astro component.
 * Uses data-tooltip attributes to target specific elements.
 */
const ReactMapDBPanel: React.FC<ReactMapDBPanelProps> = ({ data }) => {
	const [showTooltip, setShowTooltip] = useState(false);
	const [tooltipContent, setTooltipContent] = useState<TooltipData | null>(
		null,
	);
	const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

	const mapObject = data;

	// Define tooltip messages for each data-tooltip attribute
	const TOOLTIP_MESSAGES = {
		// Header tooltips
		image: {
			content: `Visual representation of ${mapObject.name} - this is how it appears in-game`,
			ariaLabel: `Image shows ${mapObject.name}`,
			priority: 'low' as const,
		},
		name: {
			content: `${mapObject.name} - the display name used throughout the game`,
			ariaLabel: `Object name: ${mapObject.name}`,
			priority: 'medium' as const,
		},
		type: {
			content: `${mapObject.type.toUpperCase()} - this determines how players can interact with this object`,
			ariaLabel: `Object type: ${mapObject.type}`,
			priority: 'medium' as const,
		},

		// Resource-specific tooltips
		...(mapObject.type === 'resource' && {
			resourceType: {
				content: `${mapObject.resourceType.toUpperCase()} resource - essential for crafting and building`,
				ariaLabel: `Resource type: ${mapObject.resourceType}`,
				priority: 'high' as const,
			},
			amount: {
				content: `${((mapObject.amount / mapObject.maxAmount) * 100).toFixed(0)}% remaining - harvest before it's depleted!`,
				ariaLabel: `Resource amount: ${mapObject.amount} out of ${mapObject.maxAmount}`,
				priority: 'high' as const,
			},
			harvestYield: {
				content: `Yields ${mapObject.harvestYield} ${mapObject.resourceType} per harvest action`,
				ariaLabel: `Harvest yield: ${mapObject.harvestYield} per action`,
				priority: 'high' as const,
			},
			harvestTime: {
				content: `Takes ${mapObject.harvestTime}s per harvest - plan your gathering time accordingly`,
				ariaLabel: `Harvest time: ${mapObject.harvestTime} seconds`,
				priority: 'medium' as const,
			},
			harvestable: {
				content: mapObject.isHarvestable
					? '✅ Ready to harvest - start gathering resources!'
					: '❌ Depleted - find another resource node',
				ariaLabel: `Harvestable status: ${mapObject.isHarvestable ? 'available' : 'depleted'}`,
				priority: mapObject.isHarvestable ? 'high' : ('low' as const),
			},
			spawnWeight: {
				content: `${(mapObject.spawnWeight! * 100).toFixed(0)}% spawn chance - indicates rarity in the world`,
				ariaLabel: `Spawn weight: ${(mapObject.spawnWeight! * 100).toFixed(0)} percent`,
				priority: 'low' as const,
			},
			spawnCount: {
				content: `~${mapObject.spawnCount} nodes per map - affects resource availability`,
				ariaLabel: `Spawn count: ${mapObject.spawnCount} per map`,
				priority: 'low' as const,
			},
		}),

		// Structure-specific tooltips
		...(mapObject.type === 'structure' && {
			structureType: {
				content: `${mapObject.structureType.toUpperCase()} - ${
					mapObject.structureType === 'building'
						? 'provides shelter and storage'
						: mapObject.structureType === 'wall'
							? 'defensive barrier for protection'
							: mapObject.structureType === 'tower'
								? 'elevated defensive position'
								: 'decorative element for aesthetics'
				}`,
				ariaLabel: `Structure type: ${mapObject.structureType}`,
				priority: 'high' as const,
			},
			footprint: {
				content: `Occupies ${mapObject.footprintWidth}×${mapObject.footprintHeight} tiles - plan your layout carefully`,
				ariaLabel: `Footprint: ${mapObject.footprintWidth} by ${mapObject.footprintHeight} tiles`,
				priority: 'medium' as const,
			},
			health: {
				content: `${mapObject.maxHealth} HP - can withstand significant damage before destruction`,
				ariaLabel: `Maximum health: ${mapObject.maxHealth} hit points`,
				priority: 'high' as const,
			},
			constructionTime: {
				content: `${mapObject.constructionTime}s build time - gather materials before starting construction`,
				ariaLabel: `Construction time: ${mapObject.constructionTime} seconds`,
				priority: 'medium' as const,
			},
			walkable: {
				content: mapObject.isWalkable
					? "🚶 Units can pass through - won't block movement"
					: '🚫 Blocks movement - creates impassable barrier',
				ariaLabel: `Walkable: ${mapObject.isWalkable ? 'yes' : 'no'}`,
				priority: 'medium' as const,
			},
			placement: {
				content: mapObject.blocksPlacement
					? '🚫 Exclusive placement - no other structures allowed here'
					: '✅ Allows stacking - other structures can share this space',
				ariaLabel: `Blocks placement: ${mapObject.blocksPlacement ? 'yes' : 'no'}`,
				priority: 'medium' as const,
			},
		}),

		// Technical tooltips
		technical: {
			content: `Dev info: Layer=${mapObject.sortingLayer}, PPU=${mapObject.pixelsPerUnit} - affects rendering order and quality`,
			ariaLabel: `Technical information for ${mapObject.name}`,
			priority: 'low' as const,
		},
	};

	useEffect(() => {
		// Register event listeners on component mount
		ServiceMapDB.registerEventListeners();

		// Function to handle mouse enter on tooltip elements
		const handleMouseEnter = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const tooltipElement = target.closest(
				'[data-tooltip]',
			) as HTMLElement;
			const tooltipKey = tooltipElement?.getAttribute('data-tooltip');

			if (
				tooltipKey &&
				tooltipElement &&
				TOOLTIP_MESSAGES[tooltipKey as keyof typeof TOOLTIP_MESSAGES]
			) {
				const tooltip =
					TOOLTIP_MESSAGES[
						tooltipKey as keyof typeof TOOLTIP_MESSAGES
					];

				// Get the parent container (the relative positioned div)
				const container = document.querySelector(
					'.relative.rounded-2xl',
				) as HTMLElement;
				if (!container) return;

				const elementRect = tooltipElement.getBoundingClientRect();
				const containerRect = container.getBoundingClientRect();

				// Calculate position relative to the container
				const x =
					elementRect.left -
					containerRect.left +
					elementRect.width / 2;
				const y = elementRect.top - containerRect.top;

				console.log('Container rect:', containerRect);
				console.log('Element rect:', elementRect);
				console.log('Calculated position:', { x, y });

				setTooltipPosition({ x, y });
				setTooltipContent(tooltip);
				setShowTooltip(true);

				ServiceMapDB.onTooltipShow(mapObject, tooltip);
				ServiceMapDB.onObjectFocus(mapObject, 'mouse');
			}
		};

		// Function to handle mouse leave
		const handleMouseLeave = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const isTooltipElement = target.closest('[data-tooltip]');

			if (isTooltipElement) {
				setShowTooltip(false);
				setTooltipContent(null);
				ServiceMapDB.onTooltipHide(mapObject);
			}
		};

		// Function to handle click events for analytics
		const handleClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const tooltipElement = target.closest(
				'[data-tooltip]',
			) as HTMLElement;
			const tooltipKey = tooltipElement?.getAttribute('data-tooltip');

			if (tooltipKey && tooltipElement) {
				// Track the specific tooltip section that was clicked
				ServiceMapDB.onObjectInteract(mapObject, 'click');

				// Also track accessibility action for better UX analytics
				ServiceMapDB.onAccessibilityAction(mapObject, 'tooltip_click', {
					tooltipKey,
					elementType: tooltipElement.tagName.toLowerCase(),
					hasKeyboard: event.detail === 0, // Click via keyboard if detail is 0
				});
			}
		};

		// Function to handle keyboard events for accessibility
		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			const tooltipElement = target.closest(
				'[data-tooltip]',
			) as HTMLElement;
			const tooltipKey = tooltipElement?.getAttribute('data-tooltip');

			if (
				tooltipKey &&
				tooltipElement &&
				(event.key === 'Enter' || event.key === ' ')
			) {
				event.preventDefault();

				// Track keyboard interaction
				ServiceMapDB.onObjectInteract(mapObject, 'keyboard');
				ServiceMapDB.onAccessibilityAction(
					mapObject,
					'keyboard_activate',
					{
						tooltipKey,
						key: event.key,
						elementType: tooltipElement.tagName.toLowerCase(),
					},
				);

				// Show tooltip on keyboard activation
				if (!showTooltip) {
					const tooltip =
						TOOLTIP_MESSAGES[
							tooltipKey as keyof typeof TOOLTIP_MESSAGES
						];
					if (tooltip) {
						const container = document.querySelector(
							'.relative.rounded-2xl',
						) as HTMLElement;
						if (container) {
							const elementRect =
								tooltipElement.getBoundingClientRect();
							const containerRect =
								container.getBoundingClientRect();
							const x =
								elementRect.left -
								containerRect.left +
								elementRect.width / 2;
							const y = elementRect.top - containerRect.top;

							setTooltipPosition({ x, y });
							setTooltipContent(tooltip);
							setShowTooltip(true);
							ServiceMapDB.onTooltipShow(mapObject, tooltip);
						}
					}
				}
			}
		};

		// Attach event listeners to all elements with data-tooltip
		const tooltipElements = document.querySelectorAll('[data-tooltip]');

		tooltipElements.forEach((element) => {
			element.addEventListener('mouseenter', handleMouseEnter);
			element.addEventListener('mouseleave', handleMouseLeave);
			element.addEventListener('click', handleClick);
			element.addEventListener('keydown', handleKeyDown);

			// Add cursor pointer and subtle hover effect
			(element as HTMLElement).style.cursor = 'help';

			// Make elements focusable for keyboard accessibility
			if (!(element as HTMLElement).getAttribute('tabindex')) {
				(element as HTMLElement).setAttribute('tabindex', '0');
			}

			// Add ARIA attributes for better screen reader support
			(element as HTMLElement).setAttribute('role', 'button');
			(element as HTMLElement).setAttribute(
				'aria-describedby',
				'tooltip',
			);

			element.classList.add(
				'hover:bg-white/5',
				'focus:bg-white/10',
				'focus:outline-none',
				'focus:ring-2',
				'focus:ring-cyan-400/50',
				'transition-colors',
				'duration-200',
				'rounded',
			);
		});

		// Cleanup function
		return () => {
			ServiceMapDB.unregisterEventListeners();

			tooltipElements.forEach((element) => {
				element.removeEventListener('mouseenter', handleMouseEnter);
				element.removeEventListener('mouseleave', handleMouseLeave);
				element.removeEventListener('click', handleClick);
				element.removeEventListener('keydown', handleKeyDown);
			});
		};
	}, [mapObject]);

	return (
		<>
			{/* Single tooltip that appears above hovered stats */}
			{tooltipContent && (
				<Tooltip
					content={tooltipContent.content}
					ariaLabel={tooltipContent.ariaLabel}
					priority={tooltipContent.priority}
					isVisible={showTooltip}
					position={tooltipPosition}
				/>
			)}
		</>
	);
};

export default ReactMapDBPanel;
