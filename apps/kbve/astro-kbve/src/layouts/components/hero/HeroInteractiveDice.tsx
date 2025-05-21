/** @jsxImportSource react */
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { TextureLoader, Mesh, MeshStandardMaterial, Euler, Color } from 'three';
import * as THREE from 'three';
import { useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
	$heroDiceState,
	setHeroDiceRolling,
	setHeroDiceValues,
	initHeroDice,
} from './heroDiceStore';

const texturePaths = [
	'/assets/items/set/dice/dice1.png',
	'/assets/items/set/dice/dice2.png',
	'/assets/items/set/dice/dice3.png',
	'/assets/items/set/dice/dice4.png',
	'/assets/items/set/dice/dice5.png',
	'/assets/items/set/dice/dice6.png',
];

const diceOrientations = [
	new THREE.Euler(-Math.PI / 2, -Math.PI / 2, -Math.PI / 2), // 1
	new THREE.Euler(0, Math.PI / 2, 0), // 2
	new THREE.Euler(0, -Math.PI / 2, -Math.PI / 2), // 3
	new THREE.Euler(Math.PI / 2, Math.PI, Math.PI), // 4
	new THREE.Euler(0, 0, -Math.PI / 2), // 5
	new THREE.Euler(Math.PI, 0, 0), // 6
];

function Dice({ values, rolling }: { values: number[]; rolling: boolean }) {
	const diceRefs = useRef<Mesh[]>([]);
	const textures = useRef<THREE.Texture[]>([]);
	const materialsRef = useRef<MeshStandardMaterial[]>([]);

	useEffect(() => {
		const loader = new TextureLoader();
		const gold = new Color(0xffd700);
		const cyan = new Color(0x00ffff);
		textures.current = texturePaths.map((path) => loader.load(path));
		materialsRef.current = textures.current.map(
			(tex) => new MeshStandardMaterial({ map: tex, color: cyan }),
		);

		diceRefs.current.forEach((dice) => {
			if (dice) dice.material = materialsRef.current;
		});
	}, []);

	useFrame(() => {
		diceRefs.current.forEach((dice, index) => {
			if (!dice) return;

			if (rolling) {
				dice.rotation.x += 0.2;
				dice.rotation.y += 0.25;
			} else {
				const target = diceOrientations[values[index] - 1];
				dice.rotation.x = THREE.MathUtils.lerp(
					dice.rotation.x,
					target.x,
					0.15,
				);
				dice.rotation.y = THREE.MathUtils.lerp(
					dice.rotation.y,
					target.y,
					0.15,
				);
				dice.rotation.z = THREE.MathUtils.lerp(
					dice.rotation.z,
					target.z,
					0.15,
				);
			}
		});
	});

	return (
		<>
			{values.map((val, i) => (
				<mesh
					key={i}
					ref={(el) => (diceRefs.current[i] = el!)}
					position={[i * 2 - (values.length - 1), 0, 0]}>
					<boxGeometry args={[1, 1, 1]} />
					{materialsRef.current.map((mat, j) => (
						<meshStandardMaterial
							key={j}
							attach={`material-${j}`}
							map={mat.map}
							color={mat.color}
						/>
					))}
				</mesh>
			))}
		</>
	);
}

export default function HeroInteractive(): JSX.Element {
	const state = useStore($heroDiceState);

	useEffect(() => {
		initHeroDice(); // default init: 4 dice with value 1
		const spinner = document.getElementById('hero-spinner');
		if (spinner) spinner.remove();
	}, []);

	const roll = () => {
		setHeroDiceRolling(true);
		setTimeout(() => {
			const newValues = Array.from(
				{ length: 4 },
				() => Math.floor(Math.random() * 6) + 1,
			);
			setHeroDiceValues(newValues);
			setHeroDiceRolling(false);
		}, 1500);
	};

	return (
		<div className="transition-opacity duration-700 ease-out w-full h-auto opacity-100">
			<div className="rounded-xl overflow-hidden shadow-xl w-full h-[300px] sm:h-[400px] md:h-[500px]">
				<Canvas
					shadows
					camera={{ position: [0, 0, 8], fov: 65 }}
					style={{ width: '100%', height: '100%' }}>
					<ambientLight intensity={2.5} />
					<pointLight position={[10, 10, 10]} />
					<Dice values={state.values} rolling={state.rolling} />
					<OrbitControls enableZoom={false} />
				</Canvas>
			</div>
			<div className="mt-6 flex flex-row space-x-3 items-center">
				<button
					onClick={roll}
					className="bg-cyan-600 hover:bg-cyan-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50"
					aria-label="Roll the dice"
					disabled={state.rolling}>
					Roll the Dice 🎲
				</button>
				<div className="mt-4 text-zinc-200 text-lg">
					<p>
						Total roll:{' '}
						<span className="font-bold text-white">
							{state.values.reduce((sum, val) => sum + val, 0)}
						</span>
					</p>
					<p>
						You rolled:{' '}
						<span className="font-bold text-white">
							{state.values.join(', ')}
						</span>
					</p>
				</div>
			</div>
		</div>
	);
}
