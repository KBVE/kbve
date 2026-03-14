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

const ReactMapDBPanel: React.FC<ReactMapDBPanelProps> = ({ data }) => {
	const [showTooltip, setShowTooltip] = useState(false);
	const [tooltipContent, setTooltipContent] = useState<TooltipData | null>(
		null,
	);
	const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

	const mapObject = data;

	const harvestTimeSecs = mapObject.harvest_time_ms
		? (mapObject.harvest_time_ms / 1000).toFixed(1)
		: '?';
	const amount = mapObject.initial_amount ?? mapObject.max_amount ?? 0;
	const maxAmount = mapObject.max_amount ?? 0;
	const efficiency =
		maxAmount > 0 ? ((amount / maxAmount) * 100).toFixed(0) : '0';

	const TOOLTIP_MESSAGES: Record<string, TooltipData> = {
		image: {
			content: `Visual representation of ${mapObject.name} - this is how it appears in-game`,
			ariaLabel: `Image shows ${mapObject.name}`,
			priority: 'low',
		},
		name: {
			content: `${mapObject.name} - the display name used throughout the game`,
			ariaLabel: `Object name: ${mapObject.name}`,
			priority: 'medium',
		},
		type: {
			content: `${mapObject.type.toUpperCase()} - this determines how players can interact with this object`,
			ariaLabel: `Object type: ${mapObject.type}`,
			priority: 'medium',
		},
		sub_kind: {
			content: mapObject.sub_kind
				? `${mapObject.sub_kind.replace(/_/g, ' ').toUpperCase()} - specific variant of this ${mapObject.type}`
				: 'Unknown variant',
			ariaLabel: `Kind: ${mapObject.sub_kind ?? 'unknown'}`,
			priority: 'high',
		},
		amount: {
			content: `${efficiency}% remaining - harvest before it's depleted!`,
			ariaLabel: `Resource amount: ${amount} out of ${maxAmount}`,
			priority: 'high',
		},
		harvest_yield: {
			content: `Yields ${mapObject.harvest_yield ?? 0} per harvest action`,
			ariaLabel: `Harvest yield: ${mapObject.harvest_yield ?? 0} per action`,
			priority: 'high',
		},
		harvest_time: {
			content: `Takes ${harvestTimeSecs}s per harvest - plan your gathering time accordingly`,
			ariaLabel: `Harvest time: ${harvestTimeSecs} seconds`,
			priority: 'medium',
		},
		interactable: {
			content: mapObject.interactable
				? 'Ready to harvest - start gathering resources!'
				: 'Unavailable - find another resource node',
			ariaLabel: `Harvestable status: ${mapObject.interactable ? 'available' : 'unavailable'}`,
			priority: mapObject.interactable ? 'high' : 'low',
		},
		spawn_weight: {
			content:
				mapObject.spawn_weight !== undefined
					? `${(mapObject.spawn_weight * 100).toFixed(0)}% spawn chance - indicates rarity in the world`
					: 'Unknown spawn chance',
			ariaLabel: `Spawn weight: ${mapObject.spawn_weight !== undefined ? (mapObject.spawn_weight * 100).toFixed(0) : '?'} percent`,
			priority: 'low',
		},
		spawn_count: {
			content: `~${mapObject.spawn_count ?? '?'} nodes per map - affects resource availability`,
			ariaLabel: `Spawn count: ${mapObject.spawn_count ?? '?'} per map`,
			priority: 'low',
		},
		footprint: {
			content: `Occupies ${mapObject.footprint_width ?? 1}\u00D7${mapObject.footprint_height ?? 1} tiles`,
			ariaLabel: `Footprint: ${mapObject.footprint_width ?? 1} by ${mapObject.footprint_height ?? 1} tiles`,
			priority: 'medium',
		},
		health: {
			content: `${mapObject.max_health ?? 0} HP - can withstand significant damage before destruction`,
			ariaLabel: `Maximum health: ${mapObject.max_health ?? 0} hit points`,
			priority: 'high',
		},
		construction_time: {
			content: `${mapObject.construction_time_secs ?? 0}s build time`,
			ariaLabel: `Construction time: ${mapObject.construction_time_secs ?? 0} seconds`,
			priority: 'medium',
		},
		walkable: {
			content: mapObject.blocks_movement
				? 'Blocks movement - creates impassable barrier'
				: "Units can pass through - won't block movement",
			ariaLabel: `Walkable: ${mapObject.blocks_movement ? 'no' : 'yes'}`,
			priority: 'medium',
		},
		placement: {
			content: mapObject.blocks_placement
				? 'Exclusive placement - no other structures allowed here'
				: 'Allows stacking - other structures can share this space',
			ariaLabel: `Blocks placement: ${mapObject.blocks_placement ? 'yes' : 'no'}`,
			priority: 'medium',
		},
		technical: {
			content: `Dev info: Layer=${mapObject.sorting_layer}, PPU=${mapObject.pixels_per_unit} - affects rendering order and quality`,
			ariaLabel: `Technical information for ${mapObject.name}`,
			priority: 'low',
		},
	};

	useEffect(() => {
		ServiceMapDB.registerEventListeners();

		const handleMouseEnter = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const tooltipElement = target.closest(
				'[data-tooltip]',
			) as HTMLElement;
			const tooltipKey = tooltipElement?.getAttribute('data-tooltip');

			if (tooltipKey && tooltipElement && TOOLTIP_MESSAGES[tooltipKey]) {
				const tooltip = TOOLTIP_MESSAGES[tooltipKey];

				const container = document.querySelector(
					'.relative.rounded-2xl',
				) as HTMLElement;
				if (!container) return;

				const elementRect = tooltipElement.getBoundingClientRect();
				const containerRect = container.getBoundingClientRect();

				const x =
					elementRect.left -
					containerRect.left +
					elementRect.width / 2;
				const y = elementRect.top - containerRect.top;

				setTooltipPosition({ x, y });
				setTooltipContent(tooltip);
				setShowTooltip(true);

				ServiceMapDB.onTooltipShow(mapObject, tooltip);
				ServiceMapDB.onObjectFocus(mapObject, 'mouse');
			}
		};

		const handleMouseLeave = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (target.closest('[data-tooltip]')) {
				setShowTooltip(false);
				setTooltipContent(null);
				ServiceMapDB.onTooltipHide(mapObject);
			}
		};

		const handleClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const tooltipElement = target.closest(
				'[data-tooltip]',
			) as HTMLElement;
			const tooltipKey = tooltipElement?.getAttribute('data-tooltip');

			if (tooltipKey && tooltipElement) {
				ServiceMapDB.onObjectInteract(mapObject, 'click');
				ServiceMapDB.onAccessibilityAction(mapObject, 'tooltip_click', {
					tooltipKey,
					elementType: tooltipElement.tagName.toLowerCase(),
					hasKeyboard: event.detail === 0,
				});
			}
		};

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

				if (!showTooltip) {
					const tooltip = TOOLTIP_MESSAGES[tooltipKey];
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

		const tooltipElements = document.querySelectorAll('[data-tooltip]');

		tooltipElements.forEach((element) => {
			element.addEventListener(
				'mouseenter',
				handleMouseEnter as EventListener,
			);
			element.addEventListener(
				'mouseleave',
				handleMouseLeave as EventListener,
			);
			element.addEventListener('click', handleClick as EventListener);
			element.addEventListener('keydown', handleKeyDown as EventListener);

			(element as HTMLElement).style.cursor = 'help';

			if (!(element as HTMLElement).getAttribute('tabindex')) {
				(element as HTMLElement).setAttribute('tabindex', '0');
			}

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

		return () => {
			ServiceMapDB.unregisterEventListeners();
			tooltipElements.forEach((element) => {
				element.removeEventListener(
					'mouseenter',
					handleMouseEnter as EventListener,
				);
				element.removeEventListener(
					'mouseleave',
					handleMouseLeave as EventListener,
				);
				element.removeEventListener(
					'click',
					handleClick as EventListener,
				);
				element.removeEventListener(
					'keydown',
					handleKeyDown as EventListener,
				);
			});
		};
	}, [mapObject]);

	return (
		<>
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
