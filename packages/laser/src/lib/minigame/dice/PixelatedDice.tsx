// src/components/PixelatedDice.tsx
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { PixelatedDiceProps } from '../../../types';


const PixelatedDice: React.FC<PixelatedDiceProps> = ({ side1, side2, side3, side4, side5, side6, isRolling, dice }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const positionRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const textures = [
      loader.load(side1),
      loader.load(side2),
      loader.load(side3),
      loader.load(side4),
      loader.load(side5),
      loader.load(side6),
    ];

    const materials = textures.map(texture => new THREE.MeshBasicMaterial({ map: texture }));
    if (meshRef.current) {
      meshRef.current.material = materials;
    }
  }, [side1, side2, side3, side4, side5, side6]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      if (isRolling) {
        // Randomize position and rotation while rolling
        positionRef.current.x += (Math.random() - 0.5) * delta * 10;
        positionRef.current.y += (Math.random() - 0.5) * delta * 10;
        positionRef.current.z += (Math.random() - 0.5) * delta * 10;
        meshRef.current.rotation.x += 0.2;
        meshRef.current.rotation.y += 0.2;
      } else {
        // Reset to initial position and rotation
        positionRef.current.x = THREE.MathUtils.lerp(positionRef.current.x, 0, 0.1);
        positionRef.current.y = THREE.MathUtils.lerp(positionRef.current.y, 0, 0.1);
        positionRef.current.z = THREE.MathUtils.lerp(positionRef.current.z, 0, 0.1);
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, 0.1);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, 0.1);
      }
      meshRef.current.position.set(positionRef.current.x, positionRef.current.y, positionRef.current.z);
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
};

export default PixelatedDice;