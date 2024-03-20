
import styled from 'styled-components';
import React, { useEffect, useRef } from 'react';


import Phaser from 'phaser';
import GridEngine from 'grid-engine';

import { enable3d, Canvas } from '@enable3d/phaser-extension'


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
        title: "Phaser Enable3D - Demo",
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

        //type: Phaser.AUTO,
        type: Phaser.WEBGL,
        transparent: true,
        width: 920,
        height: 700,
        // Physics -> Default Arcade
        // [START]
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
            worldBounds: true,
            emitOnWorldBounds: true
          }
        },
        // [END]
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

        ...Canvas()
      };

      const gameConfig = { ...config, parent: gameParent };
      const game = new Phaser.Game(gameConfig);
      //enable3d(() => new Phaser.Game(config)).withPhysics('assets/ammo')
      //enable3d(() => game).withPhysics('assets/ammo')
      enable3d(() =>  game);



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
