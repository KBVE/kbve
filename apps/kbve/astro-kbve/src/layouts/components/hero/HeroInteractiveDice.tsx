/** @jsxImportSource react */
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { TextureLoader } from 'three';
import * as THREE from 'three';
import { useRef, useState, useEffect } from 'react';

type Vec3 = [number, number, number];

type DiceFace = {
	value: number;
	texture: string;
	rotation: THREE.Euler;
};

const diceFaceMap: Record<number, DiceFace> = {
	1: {
		value: 1,
		texture: '/assets/items/set/dice/dice1.png',
		rotation: new THREE.Euler(Math.PI / 2, 0, 0), // top → front
	},
	2: {
		value: 2,
		texture: '/assets/items/set/dice/dice2.png',
		rotation: new THREE.Euler(0, 0, 0), // front stays front
	},
	3: {
		value: 3,
		texture: '/assets/items/set/dice/dice3.png',
		rotation: new THREE.Euler(0, Math.PI, 0), // back → front
	},
	4: {
		value: 4,
		texture: '/assets/items/set/dice/dice4.png',
		rotation: new THREE.Euler(0, -Math.PI / 2, 0), // right → front
	},
	5: {
		value: 5,
		texture: '/assets/items/set/dice/dice5.png',
		rotation: new THREE.Euler(0, Math.PI / 2, 0), // left → front
	},
	6: {
		value: 6,
		texture: '/assets/items/set/dice/dice6.png',
		rotation: new THREE.Euler(-Math.PI / 2, 0, 0), // bottom → front
	},
};

const materialFaceOrder = [3, 4, 1, 6, 2, 5]; // right, left, top, bottom, front, back → face numbers

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
	const targetRotation = useRef(diceFaceMap[1].rotation);
	const textures = useLoader(
		TextureLoader,
		Object.values(diceFaceMap).map((face) => face.texture),
	);

	const rotationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [rolling, setRolling] = useState(false);
	const spinStartTime = useRef(0);

	// useEffect(() => {
	// 	const value = Math.floor(Math.random() * 6) + 1;
	// 	const face = diceFaceMap[value];
	// 	setFaceValue(value);
	// 	targetRotation.current = face.rotation;
	// 	onRolled?.(value);
	// }, [rollTrigger]);

	useEffect(() => {
		setRolling(true);
		spinStartTime.current = performance.now();

		const value = Math.floor(Math.random() * 6) + 1;
		const face = diceFaceMap[value];
		setFaceValue(value);

		if (rotationTimer.current) clearTimeout(rotationTimer.current);
		rotationTimer.current = setTimeout(() => {
			targetRotation.current = face.rotation;
			setRolling(false);
			onRolled?.(value);
		}, 750);
	}, [rollTrigger]);

	useFrame(() => {
		if (!mesh.current) return;

		if (rolling) {
			mesh.current.rotation.x += 0.3;
			mesh.current.rotation.y += 0.35;
			mesh.current.rotation.z += 0.2;
		} else {
			mesh.current.rotation.x = THREE.MathUtils.lerp(
				mesh.current.rotation.x,
				targetRotation.current.x,
				0.2,
			);
			mesh.current.rotation.y = THREE.MathUtils.lerp(
				mesh.current.rotation.y,
				targetRotation.current.y,
				0.2,
			);
			mesh.current.rotation.z = THREE.MathUtils.lerp(
				mesh.current.rotation.z,
				targetRotation.current.z,
				0.2,
			);
		}
	});
	return (
		<mesh ref={mesh} position={position} castShadow>
			<boxGeometry args={[1, 1, 1]} />
			{materialFaceOrder.map((faceNum, i) => (
				<meshStandardMaterial
					key={i}
					attach={`material-${i}`}
					map={textures[faceNum - 1]}
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
		resultRef.current = [1, 1, 1, 1];
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
			<div className="mt-6 flex flex-row items-center">
				<button
					onClick={handleRoll}
					className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
					aria-label="Roll the dice">
					Roll the Dice 🎲
				</button>
				<div className="mt-4 text-zinc-200 text-lg">
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
