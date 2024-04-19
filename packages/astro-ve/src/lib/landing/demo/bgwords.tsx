import React, { useEffect, useState, CSSProperties, useRef } from 'react';
import LanderHero from './LanderHero';

const words = ['Hello', 'World', 'React', 'Animation', 'Raining'];

const RandomCharacters: React.FC = () => {
	const [columns, setColumns] = useState<JSX.Element[]>([]);
	const [showComponent, setShowComponent] = useState(false);

	useEffect(() => {
		const tempColumns = words.map((word, index) => {
			const letters = word.split('').map((letter, idx) => (
				<div
					key={idx}
					className="text-cyan-700 opacity-90"
					style={{ fontSize: '20px', position: 'relative' }}>
					{letter}
				</div>
			));

			const style: CSSProperties = {
				left: `${5 + index * (100 / words.length)}%`,
				top: `-10vh`,
				animation: `rain ${Math.random() * 5 + 5}s infinite linear`,
				position: 'absolute',
			};

			return (
				<div key={index} style={style}>
					{letters}
				</div>
			);
		});

		setColumns(tempColumns);

		setTimeout(() => {
			const loader = document.getElementById('herolanding_loader');
			if (loader) {
				loader.classList.add('fade-out');
				loader.addEventListener('animationend', () => {
					loader.style.display = 'none';
					setShowComponent(true);
				});
			}
		}, 1000);
	}, []);

	return showComponent ? (
		<div className="w-full h-screen flex flex-col justify-center items-center overflow-hidden relative">
			<div className="flex items-center justify-center h-12">
				<div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-rose-200 to-cyan-500">
					Welcome to Next Generation Software Development Community
				</div>
			</div>{' '}
			<div className="absolute top-0 w-full h-full z-0">{columns}</div>
			<div className="z-10 w-full">
				<LanderHero />
			</div>
		</div>
	) : null;
};

export default RandomCharacters;
