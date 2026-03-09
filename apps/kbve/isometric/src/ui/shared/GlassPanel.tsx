import type { ReactNode } from 'react';

interface GlassPanelProps {
	children: ReactNode;
	className?: string;
}

export function GlassPanel({ children, className = '' }: GlassPanelProps) {
	return (
		<div
			className={`bg-glass backdrop-blur-[4px] rounded-glass border border-glass-border shadow-glass pointer-events-auto ${className}`}>
			{children}
		</div>
	);
}
