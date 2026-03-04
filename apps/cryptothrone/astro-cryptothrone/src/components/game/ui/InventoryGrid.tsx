import { useState, useCallback } from 'react';
import { getItemById } from '../data/items';

interface InventoryGridProps {
	backpack: string[];
}

export function InventoryGrid({ backpack }: InventoryGridProps) {
	const [tooltipItem, setTooltipItem] = useState<{
		id: string;
		x: number;
		y: number;
	} | null>(null);

	const showTooltip = useCallback((itemId: string, e: React.MouseEvent) => {
		setTooltipItem({
			id: itemId,
			x: e.clientX + 10,
			y: e.clientY - 150,
		});
	}, []);

	const hideTooltip = useCallback(() => setTooltipItem(null), []);

	if (backpack.length === 0) {
		return <p className="text-sm text-gray-500">Empty</p>;
	}

	return (
		<div className="relative">
			<ul className="grid grid-cols-8 gap-1">
				{backpack.map((itemId, idx) => {
					const item = getItemById(itemId);
					if (!item) return null;
					return (
						<li
							key={idx}
							className="relative hover:scale-[1.3] transition ease-in-out duration-100"
							onMouseEnter={(e) => showTooltip(item.id, e)}
							onMouseLeave={hideTooltip}>
							<img
								src={item.img}
								alt={item.name}
								className="w-8 h-8 border border-yellow-400/50"
							/>
						</li>
					);
				})}
			</ul>
			{tooltipItem &&
				(() => {
					const item = getItemById(tooltipItem.id);
					if (!item) return null;
					return (
						<div
							style={{
								top: tooltipItem.y,
								left: tooltipItem.x,
							}}
							className="fixed bg-gray-700 text-white p-2 rounded shadow-lg z-50 pointer-events-none">
							<p className="text-sm font-semibold">{item.name}</p>
							<p className="text-xs">Type: {item.type}</p>
							<p className="text-xs">{item.description}</p>
							{Object.entries(item.bonuses).length > 0 && (
								<p className="text-xs">
									Bonuses:{' '}
									{Object.entries(item.bonuses)
										.map(([k, v]) => `${k}: +${v}`)
										.join(', ')}
								</p>
							)}
						</div>
					);
				})()}
		</div>
	);
}
