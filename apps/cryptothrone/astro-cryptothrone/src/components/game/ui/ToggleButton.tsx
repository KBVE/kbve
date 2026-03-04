interface ToggleButtonProps {
	isCollapsed: boolean;
	onToggle: () => void;
	label: string;
}

export function ToggleButton({
	isCollapsed,
	onToggle,
	label,
}: ToggleButtonProps) {
	return (
		<button
			onClick={onToggle}
			className="bg-yellow-500 text-white text-sm p-2 rounded flex items-center gap-1 h-10">
			<span className="text-xs">{isCollapsed ? '+' : '-'}</span>
			<span className="text-xs">{label}</span>
		</button>
	);
}
