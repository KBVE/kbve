// import styled from 'styled-components';
// import React, { useEffect, useRef } from 'react';

// import Phaser from 'phaser';

// import { enable3d, Canvas } from '@enable3d/phaser-extension';

// import { Main } from './scenes';

// const StyledApp = styled.div`
// 	// Your style here
// `;

// export function Game() {

//   const gameRef = useRef<HTMLDivElement>(null); // Correctly typed for a div element
//   const phaserGameRef = useRef<Phaser.Game | null>(null); // Correctly typed for Phaser.Game instance


// 	useEffect(() => {
		
//       if (!gameRef.current) return;


// 			const initializeGame = () => {
// 				const gameParent = gameRef.current;

// 				if (!gameParent) return;

// 				const config = {
// 					title: 'Phaser Enable3D - Demo',
// 					type: Phaser.WEBGL,
// 					transparent: true,

//           scale: {
// 						mode: Phaser.Scale.FIT,
//             autoCenter: Phaser.Scale.CENTER_BOTH,
//             width: window.innerWidth * Math.max(1, window.devicePixelRatio / 2),
//             height: window.innerHeight * Math.max(1, window.devicePixelRatio / 2)
// 					},
		
// 					scene: [Main],

// 					...Canvas(),
//           parent: gameParent,
// 				};

// 				enable3d(
// 					() => {phaserGameRef.current = new Phaser.Game(config); return phaserGameRef.current;},
// 				).withPhysics('/ammo/kripken');
// 			};
      
//       initializeGame();

// 			return () => {
// 				console.log('Return Callback!');
// 				// game.destroy(true);
//         if (phaserGameRef.current) {
//           phaserGameRef.current.destroy(true);
//           console.log('Game destroyed!');
//         }
// 			};
		
// 	}, []);

// 	return (
// 		<StyledApp >
// 			<div ref={gameRef} />
// 		</StyledApp>
// 	);
// }

// export default Game;


import React, { useEffect, useRef,useState } from 'react';
import styled from 'styled-components';
import Phaser from 'phaser';
import { enable3d, Canvas } from '@enable3d/phaser-extension';
import { Main } from './scenes';

const StyledApp = styled.div`
	// Your style here
`;
export function Game() {
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const [gameInitialized, setGameInitialized] = useState(false);

  useEffect(() => {
    if (gameInitialized) {
      const config = {
        title: 'Phaser Enable3D - Demo',
        type: Phaser.WEBGL,
        transparent: true,

        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: window.innerWidth * Math.max(1, window.devicePixelRatio / 2),
          height: window.innerHeight * Math.max(1, window.devicePixelRatio / 2)
        },
        scene: [Main],

        ...Canvas(),
      };

      enable3d(() => {
        const phaserGame = new Phaser.Game(config);
        if (gameContainerRef.current) {
          phaserGame.canvas.style.width = '100%';
          phaserGame.canvas.style.height = '100%';
          gameContainerRef.current.appendChild(phaserGame.canvas);
        }
        return phaserGame;
      }).withPhysics('/ammo/kripken');

      return () => {
        // Cleanup
      };
    }
  }, [gameInitialized]);

  useEffect(() => {
    setGameInitialized(true);
  }, []);

  return (
    <StyledApp>
      <div ref={gameContainerRef} />
    </StyledApp>
  );
}


export default Game;
