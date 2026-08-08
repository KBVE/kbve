import { useState, type ReactNode } from 'react';

export interface ViewTab {
	id: string;
	label: string;
	content: ReactNode;
}

interface ViewTabsProps {
	tabs: ViewTab[];
	initialTab?: string;
}

// All panes stay mounted; inactive ones are display-toggled so stateful
// content (terminal sessions, downloads in flight) survives tab switches.
export function ViewTabs({ tabs, initialTab }: ViewTabsProps) {
	const [active, setActive] = useState(initialTab ?? tabs[0]?.id);

	return (
		<div className="flex flex-col gap-4 h-full">
			<div className="flex gap-2">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => setActive(tab.id)}
						className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
							active === tab.id
								? 'bg-logo-primary/20 text-logo-primary'
								: 'text-text/60 hover:text-text'
						}`}>
						{tab.label}
					</button>
				))}
			</div>
			{tabs.map((tab) => (
				<div
					key={tab.id}
					className="flex-1 min-h-0 flex flex-col gap-4"
					style={{
						display: active === tab.id ? undefined : 'none',
					}}>
					{tab.content}
				</div>
			))}
		</div>
	);
}
