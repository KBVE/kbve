import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Rail } from './Rail';
import { FloatingRail } from './FloatingRail';
import { useRailState } from './railStore';
import type { RailController } from './railStore';
import { railOrientationForEdge } from './models';
import type { RailGroupModel, RailItemModel } from './models';

export interface RailMountProps {
	controller: RailController;
	groups?: readonly RailGroupModel[];
	items?: readonly RailItemModel[];
	collapsedSize?: number;
	expandedSize?: number;
	header?: ReactNode;
	footer?: ReactNode;
	inset?: number;
	draggable?: boolean;
}

export const RailMount = memo(function RailMount({
	controller,
	groups,
	items,
	collapsedSize,
	expandedSize,
	header,
	footer,
	inset,
	draggable,
}: RailMountProps) {
	const state = useRailState(controller);
	const orientation = useMemo(
		() => railOrientationForEdge(state.edge),
		[state.edge],
	);

	const rail = (
		<Rail
			groups={groups}
			items={items}
			orientation={orientation}
			expanded={state.expanded}
			onExpandedChange={controller.setExpanded}
			pinned={state.pinned}
			onTogglePin={controller.togglePinned}
			collapsedSize={collapsedSize}
			expandedSize={expandedSize}
			header={header}
			footer={footer}
			bare={state.mode === 'floating'}
		/>
	);

	if (state.mode === 'floating') {
		return (
			<FloatingRail
				edge={state.edge}
				onEdgeChange={controller.setEdge}
				inset={inset}
				draggable={draggable}>
				{rail}
			</FloatingRail>
		);
	}

	return rail;
});
