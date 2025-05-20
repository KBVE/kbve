/** @jsxImportSource react */
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

type Vec3 = [number, number, number];

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
}: {
	position: Vec3;
	rollTrigger: number;
}) {
	const mesh = useRef<THREE.Mesh>(null);
	const targetRotation = useRef<THREE.Euler>(getRandomRotation());

	useEffect(() => {
		targetRotation.current = getRandomRotation();
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
			<meshStandardMaterial
				color="#ffffff"
				metalness={0.2}
				roughness={0.4}
			/>
		</mesh>
	);
}

function DiceScene({ rollTrigger }: { rollTrigger: number }) {
	return (
		<>
			<ambientLight intensity={0.5} />
			<directionalLight position={[5, 5, 5]} castShadow />
			<Die position={[-2, 0, 0]} rollTrigger={rollTrigger} />
			<Die position={[0, 0, 0]} rollTrigger={rollTrigger} />
			<Die position={[2, 0, 0]} rollTrigger={rollTrigger} />
			<Die position={[4, 0, 0]} rollTrigger={rollTrigger} />
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
					<DiceScene rollTrigger={rollTrigger} />
				</Canvas>
			</div>
			<div className="mt-6 flex justify-center">
				<button
					onClick={handleRoll}
					className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
					aria-label="Roll the dice">
					Roll the Dice 🎲
				</button>
			</div>
		</div>
	);
}
