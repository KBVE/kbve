import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../utils/cn';

export interface NotContentProps {
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	/** Wrapper element tag. Defaults to a `div`. */
	as?: 'div' | 'span' | 'section';
}

/**
 * Shields a React island from Starlight's `.sl-markdown-content` prose styles
 * (auto margins, list spacing, heading rules) by applying the official
 * `.not-content` escape-hatch class. Wrap any non-prose UI dropped into a
 * Starlight MDX page so global typography rules stop leaking in.
 */
export function NotContent({
	children,
	className,
	style,
	as = 'div',
}: NotContentProps) {
	const Tag = as;
	return (
		<Tag className={cn('not-content', className)} style={style}>
			{children}
		</Tag>
	);
}
