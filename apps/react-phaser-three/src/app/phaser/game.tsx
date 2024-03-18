
import styled from 'styled-components';
import React, { useEffect, useRef } from 'react';


import Phaser from 'phaser';
import GridEngine from 'grid-engine';


import { Main } from './scenes';

const StyledApp = styled.div`
    // Your style here
`;


export function Game() {
  const gameRef = useRef(null);

  useEffect(() => {

    if (!gameRef.current) return;


    if (gameRef.current) {


      const gameParent = gameRef.current;


      const config = {
        title: "TravelBox - The Game",
        render: {
          antialias: false,
        },

        scale: {

          //mode: Phaser.Scale.RESIZE,
          mode: Phaser.Scale.FIT,
          //autoCenter: Phaser.Scale.CENTER_BOTH,

          min: {
            width: 1024,
            height: 768,
          },

          max: {
            width: 1280,
            height: 800,
          },

          zoom: 1

        },

        type: Phaser.AUTO,
        transparent: true,
        width: 920,
        height: 700,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
            worldBounds: true,
            emitOnWorldBounds: true
          }
        },
        plugins: {
          scene: [
            {
              key: "gridEngine",
              plugin: GridEngine,
              mapping: "gridEngine",
            },
          ],
        },
        scene: [Main], //  Missing scenes.

        input: {
          mouse: {
            preventDefaultWheel: false
          },
          touch: {
            capture: false
          }
        },

      };

      const gameConfig = { ...config, parent: gameParent };
      const game = new Phaser.Game(gameConfig);



      return () => {
        // Cleanup the game when the component is unmounted
        game.destroy(true);
      };
    }
  }, []);

  return (
    <StyledApp>
      <div ref={gameRef} />
    </StyledApp>
  )
}

export default Game;
