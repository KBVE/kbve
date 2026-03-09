import { useEffect, useRef } from 'react';
import { get_selected_object_json } from '../../wasm-pkg/isometric_game.js';
import { gameEvents } from '../ui/events/event-bus';
import type { InteractableKind } from '../ui/events/event-map';

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
};

function ActionContent({
	info,
	kind,
}: {
	info: ObjectInfo;
	kind: InteractableKind;
}) {
	return (
		<div className="space-y-3">
			<p className="text-sm opacity-80">{info.description}</p>
			<button
				className="w-full px-3 py-2 text-sm font-semibold rounded
					bg-white/10 hover:bg-white/20 border border-white/20
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
				};

				const info = OBJECT_INFO[selected.kind];
				if (!info) return;

				modalOpenRef.current = true;

				gameEvents.emit('modal:open', {
					title: info.title,
					content: <ActionContent info={info} kind={selected.kind} />,
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
