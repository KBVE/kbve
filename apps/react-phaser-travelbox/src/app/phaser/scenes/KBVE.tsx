import Phaser from "phaser"
import React, { useEffect, useState } from "react"


export class KBVE extends Phaser.Scene {
  mainMenuButtonImage: Phaser.GameObjects.Image | undefined;
  mainMenuButtonText: Phaser.GameObjects.Text | undefined;
  constructor() {
    super('KBVE');
  }

  preload() {

    // Presets

    // Main Background Image from Unsplash

    //  this.load.image('mainBg', 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=2672&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'); // Ensure you have a correct path to your logo image

    // Music
    //this.load.audio('music', 'https://kbve.com/assets/img/fishchip/bg.ogg');
    this.load.audio('type', 'https://kbve.com/assets/img/fishchip/type.mp3');

    // Button Background -> Scroll
    this.load.image('wave', 'https://kbve.com/assets/img/curved-images/wave.jpg');
    // Replacing Scroll with Wave
    this.load.image('scroll', 'https://kbve.com/assets/img/fishchip/scroll.webp');

    //  Credits Background
    this.load.image('creditsBg', 'https://cdn.discordapp.com/attachments/1213306326290010112/1213992501166350466/itchcover.png?ex=65f77d9f&is=65e5089f&hm=1118240df1bba0735961a514a40d5293e91710f95d3746a1e32f61b218d63a30&');

    this.load.image('logo', 'https://kbve.com/assets/img/letter_logo.png');

    // Space Port
    //  Cloud TileSet -> cloud_tileset.png
    // this.load.image("tiles", "https://kbve.com/assets/img/fishchip/desert_tileset_1.png");
    // this.load.tilemapTiledJSON(
    //             "cloud-city-map",
    //             "https://kbve.com/assets/img/fishchip/cloud_city.json",
    // );

    this.load.image("tiles", "/space_map_nenko.png");
    this.load.tilemapTiledJSON(
      "space-map",
      "/space_data_nenko.json",
    );


    // Presets

    // Main Background Image from Unsplash

    //  this.load.image('mainBg', 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=2672&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'); // Ensure you have a correct path to your logo image

    // Music
    this.load.audio('music', '/space.ogg');
    this.load.audio('laser', '/laser.ogg');
    this.load.audio('thrust', '/thrust.ogg');
    this.load.audio('type', 'https://kbve.com/assets/img/fishchip/type.mp3');

    //ship texture
    this.load.spritesheet('ship', '/ship.png', {
      frameWidth: 32,
      frameHeight: 96
    });

    //box texture
    this.load.image('box', '/box_small.png');

    // Player
    this.load.spritesheet("player", "https://kbve.com/assets/img/fishchip/chip_charactersheet_warmer.png", {
      frameWidth: 52,
      frameHeight: 72,
    });

    // Button Background -> Scroll
    this.load.image('wave', 'https://kbve.com/assets/img/curved-images/wave.jpg');
    // Replacing Scroll with Wave
    this.load.image('scroll', 'https://kbve.com/assets/img/fishchip/scroll.webp');

    //  Credits Background
    this.load.image('creditsBg', 'https://cdn.discordapp.com/attachments/1213306326290010112/1213992501166350466/itchcover.png?ex=65f77d9f&is=65e5089f&hm=1118240df1bba0735961a514a40d5293e91710f95d3746a1e32f61b218d63a30&');

    this.load.image('logo', 'https://kbve.com/assets/img/letter_logo.png');

    // Space Port
    //  Cloud TileSet -> cloud_tileset.png
    this.load.image("tiles", "https://kbve.com/assets/img/fishchip/desert_tileset_1.png");
    this.load.tilemapTiledJSON(
      "cloud-city-map",
      "https://kbve.com/assets/img/fishchip/cloud_city.json",
    );


  }

  create() {
    this.input.keyboard.on('keydown-SPACE', () => {
      this.scene.start('Asteroids');
    });

    // Menu Music -> Replace Key from 'music' to maybe 'menumusic' ?

    //! This has to be placed back in!
    // Commenting out music for now.
    if (!this.sound.get('music')?.isPlaying) {
      this.sound.add('music', { loop: true, volume: 0.1 }).play();
    }

    // Main Menu Background
    //this.add.image(480, 480, 'mainBg').setScale(0.1);

    // Main Menu Button [START]
    //this.mainMenuButtonImage = this.add.image(480, 480, 'wave').setAlpha(0.9).setScale(0.9, 0.3).setInteractive({ useHandCursor: true });
    //this.mainMenuButtonText = this.add.text(480, 480, 'Start Game', {
    //  fontFamily: 'Arial Black', fontSize: 50, color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    //}).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.scene.start('Menu');
    //this.mainMenuButtonText.on('pointerdown', () => {
    //  this.scene.start('Menu');
    //}, this);

    // Main Menu Button [END]

    // Additional Button

  }
}
