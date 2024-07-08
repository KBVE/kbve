// src/components/PixelatedDice.tsx
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PixelatedDiceProps {
  side1: string;
  side2: string;
  side3: string;
  side4: string;
  side5: string;
  side6: string;
}

const PixelatedDice: React.FC<PixelatedDiceProps> = ({ side1, side2, side3, side4, side5, side6 }) => {
  const meshRef = useRef<THREE.Mesh>(null);

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

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
};

export default PixelatedDice;
