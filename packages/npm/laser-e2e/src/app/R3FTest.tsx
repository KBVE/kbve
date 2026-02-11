import React from 'react';
import { Stage } from '@kbve/laser';

export const R3FTest: React.FC = () => {
	return (
		<div data-testid="r3f-container" style={{ width: 640, height: 480 }}>
			<Stage className="r3f-canvas">
				<mesh data-testid="r3f-mesh">
					<boxGeometry args={[1, 1, 1]} />
					<meshStandardMaterial color="hotpink" />
				</mesh>
			</Stage>
		</div>
	);
};
