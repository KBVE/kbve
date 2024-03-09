
import styled from 'styled-components';

import Phaser from 'phaser';

import { CreditsScene } from './scenes/CreditsScene.js';
import {FishScene} from './scenes/FishScene.js';
import {GameOver} from './scenes/GameOver.js';
import {Preloader} from './scenes/Preloader.js';
import {TownScene} from './scenes/TownScene.js';


const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 }, // TownScene seems to be a top-down game, so no gravity
            debug: false
        }
    },
    scene: [TownScene, CreditsScene, FishScene, GameOver, Preloader] // Add other scenes as needed
};



const StyledApp = styled.div`
    // Your style here
`;


export function Game() {
    return (
        <StyledApp>

        </StyledApp>
    )
}

export default Game;