import Phaser from "phaser"
import React, { useEffect, useState } from "react"
import { createStars } from "./utils/world";
 
import { getScore } from './utils/score';

export class Credits  extends Phaser.Scene {
    constructor() {
        super('Credits');
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

        this.cameras.main.setBackgroundColor(0x000000);

        createStars(this, 1200, 800, 50);

        for (let i = 0; i < getScore(); i++) {
            this.createBox(15,920,700)
        }

        const creditsText = `
            Game Development: KBVE
            Graphics Design: KBVE
            Music & Sound Effects: KBVE
            Special Thanks: KBVE

            Thank you for playing!
            v1
        `;

        const textConfig = {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: 600, useAdvancedWrap: true }
        };

        const credits = this.add.text(400, 600, creditsText, textConfig).setOrigin(0.5, 0);

        this.tweens.add({
            targets: credits,
            y: -400, // Adjust this value based on the length of your credits
            ease: 'Linear',
            duration: 10000, // How long the credits take to scroll; adjust as needed
            onComplete: () => {
                this.scene.start('Space'); // Go back to the main menu, or wherever, after credits
            }
        });





    }

    createBox(vel: number, width: number, height: number) {
        const posX = Phaser.Math.Between(0, width);
        const posY = Phaser.Math.Between(0, height);
        const box = this.add.image(posX, posY, "box").setScale(1.5);
        this.physics.add.existing(box);
    
        const velocityX = Phaser.Math.Between(-vel, vel);
        const velocityY = Phaser.Math.Between(-vel, vel);
    
        // Ensure box.body exists and is not null
        if (box.body instanceof Phaser.Physics.Arcade.Body) {
            box.body.setVelocity(velocityX, velocityY);
        } else {
            console.error('Failed to create a physics body for the box');
        }
    }
    
}