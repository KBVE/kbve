import Phaser from "phaser"
import React, { useEffect, useState } from "react"


export class Menu extends Phaser.Scene {
    mainMenuButtonImage: Phaser.GameObjects.Image | undefined;
    mainMenuButtonText: Phaser.GameObjects.Text | undefined;
    constructor() {
        super('Menu');
    }

    preload() {

        // Presets

        // Main Background Image from Unsplash 

        //  this.load.image('mainBg', 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=2672&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'); // Ensure you have a correct path to your logo image
        


        

    }

    create() {


        // Menu Music -> Replace Key from 'music' to maybe 'menumusic' ?

        //! This has to be placed back in!
        // Commenting out music for now.
        // if (!this.sound.get('music')?.isPlaying) {
        //     this.sound.add('music', { loop: true, volume: 0.1 }).play();
        // }

        // Main Menu Background
        //this.add.image(480, 480, 'mainBg').setScale(0.1);

        // Main Menu Button [START]
        this.mainMenuButtonImage = this.add.image(480, 480, 'scroll').setAlpha(0.9).setScale(0.9, 0.3).setInteractive({ useHandCursor: true });
        this.mainMenuButtonText = this.add.text(480, 480, 'Menu', {
            fontFamily: 'Arial Black', fontSize: 50, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        this.mainMenuButtonText.on('pointerdown', () => {
            this.scene.start('Space');
        }, this);

        // Main Menu Button [END]


    }
}