/** @jsxImportSource react */
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';

type Vec3 = [number, number, number];

const faceRotations: Record<number, THREE.Euler> = {
	1: new THREE.Euler(0, 0, 0), // 1 up
	2: new THREE.Euler(Math.PI, 0, 0), // 2 up
	3: new THREE.Euler(Math.PI / 2, 0, 0), // 3 up
	4: new THREE.Euler(-Math.PI / 2, 0, 0), // 4 up
	5: new THREE.Euler(0, 0, -Math.PI / 2), // 5 up
	6: new THREE.Euler(0, 0, Math.PI / 2), // 6 up
};

const faceTextures = [
	'/assets/items/set/dice/dice3.png', // right
	'/assets/items/set/dice/dice4.png', // left
	'/assets/items/set/dice/dice1.png', // top (✅ 1-up)
	'/assets/items/set/dice/dice6.png', // bottom
	'/assets/items/set/dice/dice2.png', // front
	'/assets/items/set/dice/dice5.png', // back
];

function getRandomRotation(): THREE.Euler {
	return new THREE.Euler(
		Math.PI * 2 * Math.random(),
		Math.PI * 2 * Math.random(),
		Math.PI * 2 * Math.random(),
	);
}

function Die({
	position,
	rollTrigger,
	onRolled,
}: {
	position: Vec3;
	rollTrigger: number;
	onRolled?: (face: number) => void;
}) {
	const mesh = useRef<THREE.Mesh>(null);
	const [faceValue, setFaceValue] = useState(1);
	const targetRotation = useRef(faceRotations[1]);
	const textures = useLoader(TextureLoader, faceTextures);

	useEffect(() => {
		const value = Math.floor(Math.random() * 6) + 1;
		setFaceValue(value);
		targetRotation.current = faceRotations[value];
		onRolled?.(value);
	}, [rollTrigger]);

	useFrame(() => {
		if (mesh.current) {
			mesh.current.rotation.x = THREE.MathUtils.lerp(
				mesh.current.rotation.x,
				targetRotation.current.x,
				0.1,
			);
			mesh.current.rotation.y = THREE.MathUtils.lerp(
				mesh.current.rotation.y,
				targetRotation.current.y,
				0.1,
			);
			mesh.current.rotation.z = THREE.MathUtils.lerp(
				mesh.current.rotation.z,
				targetRotation.current.z,
				0.1,
			);
		}
	});

	return (
		<mesh ref={mesh} position={position} castShadow>
			<boxGeometry args={[1, 1, 1]} />
			{textures.map((tex, i) => (
				<meshStandardMaterial
					key={i}
					attach={`material-${i}`}
					map={tex}
				/>
			))}
		</mesh>
	);
}

function DiceScene({
	rollTrigger,
	onResults,
}: {
	rollTrigger: number;
	onResults: (vals: number[]) => void;
}) {
	const resultRef = useRef<number[]>([1, 1, 1, 1]);

	useEffect(() => {
		resultRef.current = [1, 1, 1, 1]; // reset
	}, [rollTrigger]);

	const handleRoll = (index: number) => (val: number) => {
		resultRef.current[index] = val;
		if (resultRef.current.every((v) => v !== 0)) {
			onResults([...resultRef.current]);
		}
	};

	return (
		<>
			<ambientLight intensity={0.5} />
			<directionalLight position={[5, 5, 5]} castShadow />

			<Die
				position={[-2, 0, 0]}
				rollTrigger={rollTrigger}
				onRolled={handleRoll(0)}
			/>
			<Die
				position={[0, 0, 0]}
				rollTrigger={rollTrigger}
				onRolled={handleRoll(1)}
			/>
			<Die
				position={[2, 0, 0]}
				rollTrigger={rollTrigger}
				onRolled={handleRoll(2)}
			/>
			<Die
				position={[4, 0, 0]}
				rollTrigger={rollTrigger}
				onRolled={handleRoll(3)}
			/>

			<mesh
				receiveShadow
				rotation={[-Math.PI / 2, 0, 0]}
				position={[0, -0.6, 0]}>
				<planeGeometry args={[20, 20]} />
				<shadowMaterial transparent opacity={0.2} />
			</mesh>
			<OrbitControls enableZoom={false} />
			<Environment preset="city" />
		</>
	);
}

export default function HeroInteractive(): JSX.Element {
	const [revealed, setRevealed] = useState(false);
	const [rollTrigger, setRollTrigger] = useState(0);
	const [diceResults, setDiceResults] = useState<number[]>([1, 1, 1, 1]);

	useEffect(() => {
		const spinner = document.getElementById('hero-spinner');
		if (spinner) spinner.remove();

		const timeout = setTimeout(() => setRevealed(true), 500);
		return () => clearTimeout(timeout);
	}, []);

	const handleRoll = () => {
		setRollTrigger((prev) => prev + 1);
	};

	return (
		<div
			className="transition-opacity duration-700 ease-out w-full h-auto"
			style={{ opacity: revealed ? 1 : 0 }}>
			<div className="rounded-xl overflow-hidden shadow-xl w-full h-[300px] sm:h-[400px] md:h-[500px]">
				<Canvas
					shadows
					camera={{ position: [2, 3, 10], fov: 50 }}
					style={{ width: '100%', height: '100%' }}>
					<DiceScene
						rollTrigger={rollTrigger}
						onResults={(vals) => setDiceResults(vals)}
					/>
				</Canvas>
			</div>
			<div className="mt-6 flex justify-center">
				<button
					onClick={handleRoll}
					className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
					aria-label="Roll the dice">
					Roll the Dice 🎲
				</button>
				<div className="mt-4 text-center text-zinc-200 text-lg">
					{diceResults.length > 0 && (
						<p>
							You rolled:{' '}
							<span className="font-bold text-white">
								{diceResults.join(', ')}
							</span>
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
