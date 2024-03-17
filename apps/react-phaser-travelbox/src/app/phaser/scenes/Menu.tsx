import Phaser from "phaser"
import React, { useEffect, useState } from "react"
import { createStars } from "./utils/world";


export class Menu extends Phaser.Scene {
    glow:Phaser.FX.Glow|undefined;
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

        this.cameras.main.setBackgroundColor(0x000000);

        createStars(this,1200,800,50)

        for (let i = 0; i < 15; i++) {
            this.createBox(15,1200,800)
        }

        const titleText = this.add.text(650, 300, 'TravelBox', {
            fontFamily: 'Arial Black', fontSize: 120, color: '#ffffff'
        }).setOrigin(0.5)
        

        //this.mainMenuButtonImage = this.add.image(650, 450, 'scroll').setAlpha(0.9).setScale(0.5, 0.2).setInteractive({ useHandCursor: true });
        this.mainMenuButtonText = this.add.text(650, 450, 'Play', {
            fontFamily: 'Arial Black', fontSize: 50, color: '#ffffff'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });



        this.glow=this.mainMenuButtonText.preFX.addGlow();
        
        this.glow.outerStrength=1
        this.glow.setActive(false)

        this.mainMenuButtonText.on("pointerover",()=>{
            console.log(this.glow)
            this.glow.setActive(true)
            console.log("glow")
        })
        this.mainMenuButtonText.on("pointerout",()=>{
            console.log(this.glow)
            if(!this.glow) return;
            this.glow.setActive(false)
            console.log("glowout")
        })
        this.mainMenuButtonText.on('pointerdown', () => {
            this.scene.start('Space');
        }, this);

        // Main Menu Button [END]


    }

    createBox(vel:number,width:number,height:number){
        const posX = Phaser.Math.Between(0, width);
        const posY = Phaser.Math.Between(0, height);
        const box=this.add.image(posX,posY,"box").setScale(1.5)
        this.physics.add.existing(box);
        const velocityX = Phaser.Math.Between(-vel, vel);
        const velocityY = Phaser.Math.Between(-vel, vel);
        box.body.setVelocity(velocityX, velocityY);
    }
}