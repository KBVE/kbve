interface ProgressBarProps {
	value: number;
	max: number;
	color: string;
	label: string;
}

export function ProgressBar({ value, max, color, label }: ProgressBarProps) {
	const pct = max > 0 ? (value / max) * 100 : 0;
	return (
		<div className="mb-1.5 md:mb-2">
			<div className="text-[8px] md:text-[10px] mb-0.5">
				{label}: {value}/{max}
			</div>
			<div className="w-[140px] md:w-[200px] h-3 md:h-5 bg-slot border-2 border-panel-border-dark overflow-hidden">
				<div
					className={`h-full ${color} transition-[width] duration-300 ease-out`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
