import React from 'react';
import { Canvas, type CanvasProps } from '@react-three/fiber';

export interface StageProps extends Partial<CanvasProps> {
	children: React.ReactNode;
	className?: string;
}

export const Stage: React.FC<StageProps> = ({
	children,
	className,
	...canvasProps
}) => (
	<Canvas
		camera={{ position: [0, 0, 5] }}
		{...canvasProps}
		className={className}
	>
		<ambientLight intensity={1.5} />
		{children}
	</Canvas>
);
