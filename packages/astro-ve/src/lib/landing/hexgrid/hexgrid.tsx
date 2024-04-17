//TODO Work in Progress HexGrid Component
//? I spent way too much time learning and trying to get this to work right, but its a bit too much for me.

import React, { useEffect, useState, CSSProperties, useRef } from 'react';

const honeycombPattern = [3, 4, 3];
const icons = [
	'🚀',
	'🎸',
	'🤖',
	'🫶',
	'🔥',
	'🕹️',
	'👾',
	'✨',
	'🌴',
	'🌴',
	'🌴',
];

interface HexagonProps {
	icon: string;
}

const Hexagon: React.FC<HexagonProps> = ({ icon }) => (
	<div className="hexagon">{icon}</div>
);

interface HexagonGridProps {
	honeycombPattern: number[];
	icons: string[];
}

const HexagonGrid: React.FC<HexagonGridProps> = ({
	honeycombPattern,
	icons,
}) => {
	return (
		<div className="hexagon-grid">
			{honeycombPattern.map((count, rowIndex) => (
				<React.Fragment key={rowIndex}>
					{Array.from({ length: count }).map((_, hexIndex) => {
						const iconIndex = rowIndex * count + hexIndex;
						return (
							<Hexagon
								key={hexIndex}
								icon={icons[iconIndex % icons.length]}
							/>
						);
					})}
				</React.Fragment>
			))}
		</div>
	);
};

export default HexagonGrid;

/*

<style is:inline>


.hexagon-grid {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  justify-content: center;
  padding: 1px;
}

.hexagon {
  width: var(--hexagon-size, 8vmin); 
  height: calc(var(--hexagon-size, 8vmin) * 0.866); 
  background-color: var(--color-primary, #ee75d2); 
  clip-path: polygon(
    50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%
  ); 
  display: flex;
  justify-content: center;
  align-items: center;
  margin: var(--gap, 0.1vmin);
  position: relative;
  cursor: pointer;
  transition: transform 0.3s ease, filter 0.3s ease;
}

.hexagon:hover {
  filter: brightness(1.2);
}

</style>

*/
