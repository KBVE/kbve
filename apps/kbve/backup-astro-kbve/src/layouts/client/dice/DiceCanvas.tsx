/** @jsxImportSource react */
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef, useEffect } from 'react';
import { TextureLoader, MeshStandardMaterial, Color, Euler, Mesh } from 'three';
import * as THREE from 'three';

const texturePaths = [
	'/assets/items/set/dice/dice1.png',
	'/assets/items/set/dice/dice2.png',
	'/assets/items/set/dice/dice3.png',
	'/assets/items/set/dice/dice4.png',
	'/assets/items/set/dice/dice5.png',
	'/assets/items/set/dice/dice6.png',
];

const diceOrientations = [
	new Euler(-Math.PI / 2, -Math.PI / 2, -Math.PI / 2),
	new Euler(0, Math.PI / 2, 0),
	new Euler(0, -Math.PI / 2, -Math.PI / 2),
	new Euler(Math.PI / 2, Math.PI, Math.PI),
	new Euler(0, 0, -Math.PI / 2),
	new Euler(Math.PI, 0, 0),
];

function Dice({ values, rolling }: { values: number[]; rolling: boolean }) {
	const diceRefs = useRef<Mesh[]>([]);
	const textures = useRef<THREE.Texture[]>([]);
	const materialsRef = useRef<MeshStandardMaterial[]>([]);

	useEffect(() => {
		const loader = new TextureLoader();
		const cyan = new Color(0x00ffff);
		textures.current = texturePaths.map((path) => loader.load(path));
		materialsRef.current = textures.current.map(
			(tex) => new MeshStandardMaterial({ map: tex, color: cyan }),
		);
	}, []);

	useFrame(() => {
		diceRefs.current.forEach((dice, index) => {
			if (!dice) return;

			if (rolling) {
				dice.rotation.x += 0.2;
				dice.rotation.y += 0.25;
			} else {
				const target = diceOrientations[values[index] - 1];
				dice.rotation.x = THREE.MathUtils.lerp(dice.rotation.x, target.x, 0.15);
				dice.rotation.y = THREE.MathUtils.lerp(dice.rotation.y, target.y, 0.15);
				dice.rotation.z = THREE.MathUtils.lerp(dice.rotation.z, target.z, 0.15);
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

export default function DiceCanvas({ values, rolling }: { values: number[]; rolling: boolean }) {
	return (
		<Canvas shadows camera={{ position: [0, 0, 8], fov: 65 }} style={{ width: '100%', height: '100%' }}>
			<ambientLight intensity={2.5} />
			<pointLight position={[10, 10, 10]} />
			<Dice values={values} rolling={rolling} />
			<OrbitControls enableZoom={false} />
		</Canvas>
	);
}
