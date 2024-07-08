import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useStore } from '@nanostores/react';
import { minigameState, setGameMode, setAction, setTextures, updateDiceValues, setRollingStatus } from '../../localdb';
import { DiceTextures, MinigameDiceProps, isDiceAction } from '../../../types';
import * as THREE from 'three';

const diceOrientations = [
  new THREE.Euler(0, 0, 0), // 1
  new THREE.Euler(Math.PI / 2, 0, 0), // 2
  new THREE.Euler(-Math.PI / 2, 0, 0), // 3
  new THREE.Euler(0, Math.PI / 2, 0), // 4
  new THREE.Euler(0, -Math.PI / 2, 0), // 5
  new THREE.Euler(Math.PI, 0, 0) // 6
];

const PixelatedDice: React.FC<{ diceValues: number[], isRolling: boolean, textures: DiceTextures }> = ({ diceValues, isRolling, textures }) => {
  const diceRefs = useRef<THREE.Mesh[]>([]);
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    materialsRef.current = [
      new THREE.MeshStandardMaterial({ map: loader.load(textures.side1) }),
      new THREE.MeshStandardMaterial({ map: loader.load(textures.side2) }),
      new THREE.MeshStandardMaterial({ map: loader.load(textures.side3) }),
      new THREE.MeshStandardMaterial({ map: loader.load(textures.side4) }),
      new THREE.MeshStandardMaterial({ map: loader.load(textures.side5) }),
      new THREE.MeshStandardMaterial({ map: loader.load(textures.side6) }),
    ];

    diceRefs.current.forEach((dice) => {
      if (dice) {
        dice.material = materialsRef.current;
      }
    });
  }, [textures]);

  useFrame(() => {
    diceRefs.current.forEach((dice, index) => {
      if (dice) {
        if (isRolling) {
          dice.rotation.x += 0.2;
          dice.rotation.y += 0.2;
        } else {
          const targetRotation = diceOrientations[diceValues[index] - 1];
          dice.rotation.x = THREE.MathUtils.lerp(dice.rotation.x, targetRotation.x, 0.1);
          dice.rotation.y = THREE.MathUtils.lerp(dice.rotation.y, targetRotation.y, 0.1);
          dice.rotation.z = THREE.MathUtils.lerp(dice.rotation.z, targetRotation.z, 0.1);
        }
      }
    });
  });

  return (
    <>
      {diceValues.map((value, index) => (
        <mesh
          key={index}
          ref={el => diceRefs.current[index] = el!}
          position={[index * 2 - (diceValues.length - 1), 0, 0]}
        >
          <boxGeometry args={[1, 1, 1]} />
          {materialsRef.current.length === 6 && materialsRef.current.map((material, i) => (
            <meshStandardMaterial attach={`material-${i}`} map={material.map} key={i} />
          ))}
        </mesh>
      ))}
    </>
  );
};

const MinigameDice: React.FC<MinigameDiceProps> = ({ styleClass, textures, diceCount }) => {
  const state = useStore(minigameState);

  useEffect(() => {
    setGameMode('Dice');
    setTextures(textures);
    setAction({
      type: 'ROLL_DICE',
      diceValues: Array(diceCount).fill(1),
      isRolling: false,
    });
  }, [textures, diceCount]);

  const rollDice = () => {
    setRollingStatus(true);
    setTimeout(() => {
      const newValues = Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1);
      console.log('New dice values:', newValues);
      updateDiceValues(newValues);
      setRollingStatus(false);
    }, 2000); // Duration matches the animation
  };

  return (
    <div className={`flex flex-col items-center justify-center p-4 ${styleClass}`}>
      <h1 className="text-2xl font-bold mb-4">Pixelated Spinning Dice</h1>
      <Canvas className="w-full h-full" camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        {isDiceAction(state.action) && (
          <PixelatedDice diceValues={state.action.diceValues} isRolling={state.action.isRolling} textures={state.textures as DiceTextures} />
        )}
      </Canvas>
      {isDiceAction(state.action) && (
        <button
          onClick={rollDice}
          className={`mt-4 p-2 border border-gray-300 rounded ${state.action.isRolling ? 'opacity-50' : ''}`}
          disabled={state.action.isRolling}
        >
          Roll Dice
        </button>
      )}
    </div>
  );
};

export default MinigameDice;
