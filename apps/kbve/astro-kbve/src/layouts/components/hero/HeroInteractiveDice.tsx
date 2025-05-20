/** @jsxImportSource react */
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { TextureLoader } from 'three';
import * as THREE from 'three';
import { useRef, useState, useEffect } from 'react';

type Vec3 = [number, number, number];

const texturePaths = [
  '/assets/items/set/dice/dice3.png', // +X → material-0 (right)
  '/assets/items/set/dice/dice4.png', // -X → material-1 (left)
  '/assets/items/set/dice/dice1.png', // +Y → material-2 (top)
  '/assets/items/set/dice/dice6.png', // -Y → material-3 (bottom)
  '/assets/items/set/dice/dice2.png', // +Z → material-4 (front)
  '/assets/items/set/dice/dice5.png', // -Z → material-5 (back)
];

const faceRotations: Record<number, THREE.Euler> = {
  1: new THREE.Euler(Math.PI / 2, 0, 0),       // top to front
  2: new THREE.Euler(0, 0, 0),                // front
  3: new THREE.Euler(0, Math.PI, 0),          // back to front
  4: new THREE.Euler(0, -Math.PI / 2, 0),     // right to front
  5: new THREE.Euler(0, Math.PI / 2, 0),      // left to front
  6: new THREE.Euler(-Math.PI / 2, 0, 0),     // bottom to front
};

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
  const textures = useLoader(TextureLoader, texturePaths);

  const [faceValue, setFaceValue] = useState(1);
  const [rolling, setRolling] = useState(false);
  const targetRotation = useRef(faceRotations[1]);
  const rotationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRolling(true);

    const value = Math.floor(Math.random() * 6) + 1;
    setFaceValue(value);

    if (rotationTimer.current) clearTimeout(rotationTimer.current);
    rotationTimer.current = setTimeout(() => {
      targetRotation.current = faceRotations[value];
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
        0.15
      );
      mesh.current.rotation.y = THREE.MathUtils.lerp(
        mesh.current.rotation.y,
        targetRotation.current.y,
        0.15
      );
      mesh.current.rotation.z = THREE.MathUtils.lerp(
        mesh.current.rotation.z,
        targetRotation.current.z,
        0.15
      );
    }
  });

  return (
    <mesh ref={mesh} position={position} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      {textures.map((texture, i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          map={texture}
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

      <Die position={[-2, 0, 0]} rollTrigger={rollTrigger} onRolled={handleRoll(0)} />
      <Die position={[0, 0, 0]} rollTrigger={rollTrigger} onRolled={handleRoll(1)} />
      <Die position={[2, 0, 0]} rollTrigger={rollTrigger} onRolled={handleRoll(2)} />
      <Die position={[4, 0, 0]} rollTrigger={rollTrigger} onRolled={handleRoll(3)} />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
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
      style={{ opacity: revealed ? 1 : 0 }}
    >
      <div className="rounded-xl overflow-hidden shadow-xl w-full h-[300px] sm:h-[400px] md:h-[500px]">
        <Canvas
          shadows
          camera={{ position: [2, 3, 10], fov: 50 }}
          style={{ width: '100%', height: '100%' }}
        >
          <DiceScene rollTrigger={rollTrigger} onResults={(vals) => setDiceResults(vals)} />
        </Canvas>
      </div>
      <div className="mt-6 flex flex-row items-center">
        <button
          onClick={handleRoll}
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
          aria-label="Roll the dice"
        >
          Roll the Dice 🎲
        </button>
        <div className="mt-4 text-zinc-200 text-lg">
          <p>
            You rolled:{' '}
            <span className="font-bold text-white">
              {diceResults.join(', ')}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
