
import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import PixelatedDice from './PixelatedDice';

import  { MinigameDiceProps } from '../../../types';


const MinigameDice: React.FC<MinigameDiceProps> = (props) => {
  const { styleClass, ...diceProps } = props;
  const [isRolling, setIsRolling] = useState(false);

  const rollDice = () => {
    setIsRolling(true);
    setTimeout(() => {
      setIsRolling(false);
    }, 2000); // Duration matches the animation
  };

  useEffect(() => {
    rollDice();
  }, []);

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen p-4 bg-gray-100 ${styleClass}`}>
      <h1 className="text-2xl font-bold mb-4">Pixelated Spinning Dice</h1>
      <Canvas className="w-full h-full" camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <PixelatedDice {...diceProps} />
      </Canvas>
      <button
        onClick={rollDice}
        className={`mt-4 p-2 border border-gray-300 rounded ${isRolling ? 'opacity-50' : ''}`}
        disabled={isRolling}
      >
        Roll Dice
      </button>
    </div>
  );
};

export default MinigameDice;