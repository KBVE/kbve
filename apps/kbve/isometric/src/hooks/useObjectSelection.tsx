import { useEffect, useRef } from 'react';
import { get_selected_object_json } from '../../wasm-pkg/isometric_game.js';
import { gameEvents } from '../ui/events/event-bus';
import type { FlowerArchetype, InteractableKind } from '../ui/events/event-map';

interface ObjectInfo {
	title: string;
	description: string;
	action: string;
}

const OBJECT_INFO: Record<InteractableKind, ObjectInfo> = {
	tree: {
		title: 'Tree',
		description: 'A sturdy tree with rough bark.',
		action: 'Chop Tree',
	},
	crate: {
		title: 'Wooden Crate',
		description: 'A wooden crate. Might contain something.',
		action: 'Open Crate',
	},
	crystal: {
		title: 'Crystal',
		description: 'A glowing crystal pulsing with energy.',
		action: 'Mine Crystal',
	},
	pillar: {
		title: 'Stone Pillar',
		description: 'An ancient stone pillar.',
		action: 'Examine',
	},
	sphere: {
		title: 'Metallic Sphere',
		description: 'A mysterious metallic sphere.',
		action: 'Examine',
	},
	flower: {
		title: 'Flower',
		description: 'A beautiful flower.',
		action: 'Collect Flower',
	},
};

const FLOWER_INFO: Record<
	FlowerArchetype,
	{ title: string; description: string }
> = {
	tulip: {
		title: 'Tulip',
		description: 'A vibrant tulip with soft petals.',
	},
	daisy: {
		title: 'Daisy',
		description: 'A cheerful white daisy swaying gently.',
	},
	lavender: {
		title: 'Lavender',
		description: 'A fragrant lavender sprig.',
	},
	bell: {
		title: 'Bellflower',
		description: 'A delicate bellflower with drooping petals.',
	},
	wildflower: {
		title: 'Wildflower',
		description: 'A bright wildflower growing freely.',
	},
};

function ActionContent({ info }: { info: ObjectInfo }) {
	return (
		<div className="space-y-2">
			{/* Description in inset panel */}
			<div className="px-2 py-1.5 bg-[#1e1408] border border-[#5a4a2a]">
				<p className="text-[8px] text-text leading-relaxed">
					{info.description}
				</p>
			</div>
			{/* Centered RPG button */}
			<div className="flex justify-center pt-1">
				<button
					className="px-4 py-1.5 text-[8px] text-text
						bg-btn border-2 border-btn-border
						shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_0_#1a3a10]
						hover:bg-btn-hover active:bg-btn-active active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]
						transition-colors cursor-pointer"
					onClick={() => {
						gameEvents.emit('toast:show', {
							message: `${info.action}: ${info.title}`,
							severity: 'info',
						});
						gameEvents.emit('modal:close');
					}}>
					{info.action}
				</button>
			</div>
		</div>
	);
}

export function useObjectSelection() {
	const modalOpenRef = useRef(false);

	useEffect(() => {
		const interval = setInterval(() => {
			// Don't poll while modal is already showing an action
			if (modalOpenRef.current) return;

			try {
				const json = get_selected_object_json();
				if (!json) return;

				const selected = JSON.parse(json) as {
					kind: InteractableKind;
					position: [number, number, number];
					entity_id: number;
					sub_kind?: string;
				};

				let info = OBJECT_INFO[selected.kind];
				if (!info) return;

				// For flowers, override with archetype-specific details
				if (selected.kind === 'flower' && selected.sub_kind) {
					const flower =
						FLOWER_INFO[selected.sub_kind as FlowerArchetype];
					if (flower) {
						info = {
							...info,
							title: flower.title,
							description: flower.description,
						};
					}
				}

				modalOpenRef.current = true;

				gameEvents.emit('modal:open', {
					title: info.title,
					size: 'xs' as const,
					content: <ActionContent info={info} />,
					onClose: () => {
						modalOpenRef.current = false;
					},
				});
			} catch {
				// WASM not ready
			}
		}, 100);

		return () => clearInterval(interval);
	}, []);
}
