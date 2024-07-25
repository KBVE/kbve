import styled from 'styled-components';
import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import GridEngine from 'grid-engine';
import { Title } from './Title';
import { SandCity } from './scene/SandCity';
import { CloudCity } from './scene/CloudCity';

const StyledApp = styled.div`
  width: 100vw;
  height: 100vh;
`;

export function Game() {
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: Phaser.Game | null = null;

    if (gameRef.current) {
      const gameParent = gameRef.current;

      const config: Phaser.Types.Core.GameConfig = {
        title: 'CryptoThrone',
        render: {
          antialias: false,
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          zoom: 1,
        },
        type: Phaser.AUTO,
        transparent: true,
        width: window.innerWidth,
        height: window.innerHeight,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 }, 
            debug: false,
          },
        },
        plugins: {
          scene: [
            {
              key: 'gridEngine',
              plugin: GridEngine,
              mapping: 'gridEngine',
            },
          ],
        },
        scene: [Title, SandCity, CloudCity],
        input: {
          mouse: {
            preventDefaultWheel: false,
          },
          touch: {
            capture: true,
          },
        },
        parent: gameParent,
      };

      game = new Phaser.Game(config);

      const resizeGame = () => {
        if (game) {
          game.scale.resize(window.innerWidth, window.innerHeight);
        }
      };

      window.addEventListener('resize', resizeGame);

      return () => {
        window.removeEventListener('resize', resizeGame);
        if (game) {
          game.destroy(true);
        }
      };
    }
  }, []);

  return (
    <StyledApp>
      
        <div className="w-full h-full scrollbar-hide" ref={gameRef} />
     
    </StyledApp>
  );
}

export default Game;
