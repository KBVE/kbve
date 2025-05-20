/** @jsxImportSource react */
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, SoftShadows, Environment } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

function Die({ position }: { position: [number, number, number] }) {
	const mesh = useRef<THREE.Mesh>(null);
	const [rotationSpeed] = useState(() => Math.random() * 0.02 + 0.01);

	useFrame(() => {
		if (mesh.current) {
			mesh.current.rotation.x += rotationSpeed;
			mesh.current.rotation.y += rotationSpeed * 0.8;
		}
	});

	return (
		<mesh ref={mesh} position={position} castShadow>
			<boxGeometry args={[1, 1, 1]} />
			<meshStandardMaterial
				color="white"
				roughness={0.4}
				metalness={0.2}
			/>
		</mesh>
	);
}

function DiceGroup() {
	return (
		<>
			<ambientLight intensity={0.5} />
			<directionalLight
				position={[5, 5, 5]}
				intensity={1}
				castShadow
				shadow-mapSize-width={1024}
				shadow-mapSize-height={1024}
			/>
			<SoftShadows />

			<Die position={[-2, 0, 0]} />
			<Die position={[0, 0, 0]} />
			<Die position={[2, 0, 0]} />
			<Die position={[4, 0, 0]} />

			<mesh
				receiveShadow
				rotation={[-Math.PI / 2, 0, 0]}
				position={[0, -0.6, 0]}>
				<planeGeometry args={[20, 20]} />
				<shadowMaterial transparent opacity={0.2} />
			</mesh>

			<Environment preset="city" />
			<OrbitControls enableZoom={false} />
		</>
	);
}

export default function HeroInteractive(): JSX.Element {
	const [revealed, setRevealed] = useState(false);

	useEffect(() => {
		const spinner = document.getElementById('hero-spinner');
		if (spinner) spinner.remove();

		const timeout = setTimeout(() => setRevealed(true), 500);
		return () => clearTimeout(timeout);
	}, []);

	return (
		<div
			className="transition-opacity duration-700 ease-out w-full h-[300px] sm:h-[400px] md:h-[500px]"
			style={{ opacity: revealed ? 1 : 0 }}>
			<Canvas
				shadows
				camera={{ position: [0, 5, 10], fov: 50 }}
				style={{ borderRadius: '1rem', width: '100%', height: '100%' }}>
				<DiceGroup />
			</Canvas>
		</div>
	);
}
