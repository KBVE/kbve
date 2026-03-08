interface ProgressBarProps {
	value: number;
	max: number;
	color: string;
	label: string;
}

export function ProgressBar({ value, max, color, label }: ProgressBarProps) {
	const pct = max > 0 ? (value / max) * 100 : 0;
	return (
		<div className="mb-1.5">
			<div className="text-[11px] mb-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
				{label}: {value}/{max}
			</div>
			<div className="w-[180px] h-3.5 bg-black/60 rounded-slot overflow-hidden border border-glass-border">
				<div
					className={`h-full ${color} transition-[width] duration-300 ease-out`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
