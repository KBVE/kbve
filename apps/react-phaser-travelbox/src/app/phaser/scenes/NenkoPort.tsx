import Phaser from "phaser"

import { createStars } from "./utils/world";

const NUMBER_OF_ASTEROIDS = 300;
const NUMBER_OF_STARS = 500; // Adjust based on how dense you want the star background to be
const WORLD_HEIGHT = 1500;
const WORLD_WIDTH = 1500;



export class NenkoPort extends Phaser.Scene {
    private asteroids: Phaser.GameObjects.Arc[];
    private bullets: Phaser.Physics.Arcade.Group | null;
    private player: Phaser.GameObjects.Triangle | null;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null;
  
    constructor() {
      super('NenkoPort');
      this.asteroids = [];
      this.bullets = null;
      this.player = null;
      this.cursors = null;
      this.thrustSoundPlaying = false; // Add this line
    }
  
    create() {
  
  
  
      this.thrustSound = this.sound.add('thrust', { loop: true, volume: 0.1 });
  
      // make background black
      this.cameras.main.setBackgroundColor(0x000000);
      this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT); // Adjust size as needed
      // Set up keyboard controls
      this.cursors = this.input.keyboard?.createCursorKeys() ?? null;
  
      // Create the player as a triangle in the center of the game
      this.player = this.add.triangle(750, 750, 0, -10, 10, 10, -10, 10, 0xffffff);
      this.physics.add.existing(this.player);
  
  
      // Adjust the origin of the triangle. Start with the geometric center and adjust if necessary
      this.player.setOrigin(0.1, 0.1); // Adjust this as needed
  
      // Make the player physics-enabled
      this.player.body?.setDrag(100);
      this.player.body?.setMaxVelocity(200);
      this.player.body?.setCollideWorldBounds(true);
  
      this.add.text(this.player.x - 200, this.player.y - 200, 'Cadet!\nWe are under attack!\nDestroy the enemy spaceship. \nBring the cargo back to the station!', { fontSize: '16px', fill: '#fff' });
  
      const graphics = this.make.graphics({}, false);
      graphics.fillStyle(0xff0000, 1); // Set color to red
      graphics.fillRect(0, 0, 10, 10); // Draw a 10x10 square
      graphics.generateTexture('bulletTexture', 10, 10); // Generate a texture named 'bulletTexture'
      graphics.destroy(); // Clean up the graphics object
  
  
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
      this.cameras.main.setZoom(1); // Optional, adjust zoom level as needed
  
      // Now 'bulletTexture' can be used to create sprites
      this.bullets = this.physics.add.group({
        defaultKey: 'bulletTexture',
        maxSize: 20 // Adjust based on your needs
      });
  
      createStars(this, WORLD_WIDTH, WORLD_HEIGHT, NUMBER_OF_STARS);
  
      for (let i = 0; i < NUMBER_OF_ASTEROIDS; i++) {
        //this.addAsteroid();
      }
      this.physics.add.collider(this.bullets, this.asteroids, (bullet, asteroid) => {
        bullet.destroy(); // Destroy the bullet
        asteroid.destroy(); // Destroy the asteroid
      }, undefined, this);
  
      this.physics.add.collider(this.player, this.asteroids, this.gameOver, null, this);
  
  
      this.input.keyboard.on('keydown-SPACE', () => {
        const bullet = this.bullets.get(this.player.x, this.player.y);
        this.sound.play('laser', { volume: 0.1 });
        if (bullet) {
          bullet.setActive(true).setVisible(true);
          bullet.body.setAllowGravity(false); // Ensure the bullet doesn't fall due to gravity
          this.physics.velocityFromRotation(this.player.rotation - Math.PI / 2, 400, bullet.body.velocity); // Propel the bullet
  
          bullet.body.setCollideWorldBounds(true); // Make bullet collide with world bounds
          bullet.body.onWorldBounds = true; // Enable world bounds event for the bullet
  
          // Automatically destroy the bullet when it goes out of bounds
          bullet.body.world.on('worldbounds', (body) => {
            if (body.gameObject === bullet) {
              bullet.destroy(); // Destroy the bullet
            }
          }, this);
        }
      });
  
      // Create a yellow square
      const boxSize = 20; // Size of the square
      const boxX = Phaser.Math.Between(0, WORLD_WIDTH - boxSize);
      const boxY = Phaser.Math.Between(0, WORLD_HEIGHT - boxSize);
      const graphicsYellowBox = this.add.graphics({ fillStyle: { color: 0xffff00 } });
      graphicsYellowBox.fillRect(0, 0, boxSize, boxSize);
      graphicsYellowBox.generateTexture('yellowBoxTexture', boxSize, boxSize);
      graphicsYellowBox.clear(); // Clear the graphics object now that the texture is created
  
      this.yellowBox = this.physics.add.sprite(boxX, boxY, 'yellowBoxTexture');
  
      this.physics.add.overlap(this.player, this.yellowBox, (player, box) => {
        this.attachBoxToPlayer(box);
      }, null, this);
  
  
      // Draw a big blue circle
      const circleGraphics = this.add.graphics({ fillStyle: { color: 0x0000ff } });
      const circleRadius = 50; // Radius of the circle
      circleGraphics.fillCircle(circleRadius, circleRadius, circleRadius);
      circleGraphics.generateTexture('blueCircleTexture', circleRadius * 2, circleRadius * 2);
      circleGraphics.clear(); // Clear the graphics object now that the texture is created
  
      const circleX = Phaser.Math.Between(circleRadius, WORLD_WIDTH - circleRadius);
      const circleY = Phaser.Math.Between(circleRadius, WORLD_HEIGHT - circleRadius);
      this.blueCircle = this.physics.add.sprite(circleX, circleY, 'blueCircleTexture');
  
  
      this.physics.add.overlap(this.player, this.blueCircle, () => {
        if (this.boxAttached) { // Check if the box is attached to the player
          this.youWin();
        }
      }, null, this);
  
    }
  
    attachBoxToPlayer(box) {
      box.body.setEnable(false); // Disable physics
      this.boxAttached = true; // Flag to check in the update loop
    }
  
  
    addAsteroid() {
      const cameraBounds = this.cameras.main.getBounds();
  
      // Define margins outside the camera view where asteroids can spawn
      const margin = 25; // Distance outside the camera view
  
      // Calculate safe spawn zones based on the camera view
      let x, y;
      if (Phaser.Math.Between(0, 1)) {
        // Spawn to the left or right of the camera view
        x = Phaser.Math.Between(0, 1) ? cameraBounds.left - margin : cameraBounds.right + margin;
        y = Phaser.Math.Between(0, WORLD_HEIGHT);
      } else {
        // Spawn above or below the camera view
        x = Phaser.Math.Between(0, WORLD_WIDTH);
        y = Phaser.Math.Between(0, 1) ? cameraBounds.top - margin : cameraBounds.bottom + margin;
      }
  
      // Ensure x and y are within world bounds
      x = Phaser.Math.Clamp(x, 0, WORLD_WIDTH);
      y = Phaser.Math.Clamp(y, 0, WORLD_HEIGHT);
  
      const asteroid = this.add.circle(x, y, Phaser.Math.Between(10, 20), 0x8B4513);
      this.physics.add.existing(asteroid);
  
      const velocityX = Phaser.Math.Between(-100, 100);
      const velocityY = Phaser.Math.Between(-100, 100);
      asteroid.body.setVelocity(velocityX, velocityY);
  
      asteroid.body.setCollideWorldBounds(true);
      asteroid.body.onWorldBounds = true; // Enable world bounds collision event for this body
  
      // Listen for the world bounds event
      asteroid.body.world.on('worldbounds', (body) => {
        if (body.gameObject === asteroid) {
          asteroid.destroy(); // Destroy the asteroid
          this.addAsteroid(); // Add a new asteroid
        }
      }, this);
  
      this.asteroids.push(asteroid);
    }
  
  
  
  
    update() {
      // Checking keyboard input to rotate the player
      if (this.cursors?.left?.isDown) {
        this.player.rotation -= 0.05; // Rotate left
      } else if (this.cursors?.right?.isDown) {
        this.player.rotation += 0.05; // Rotate right
      }
  
      // Move forward
      if (this.cursors?.up?.isDown) {
        this.physics.velocityFromRotation(this.player.rotation - Math.PI / 2, 200, this.player.body.velocity);
        if (!this.thrustSoundPlaying) {
          this.thrustSound.play();
          this.thrustSoundPlaying = true; // Update the flag
        }
      } else {
        if (this.thrustSoundPlaying) {
          this.thrustSound.pause();
          this.thrustSoundPlaying = false; // Update the flag
        }
        this.player.body.setDrag(100);
      }
  
      if (this.boxAttached) {
        // Distance behind the player for the box to follow
        const followDistance = 30;
  
        // Calculate the position behind the player
        const angle = this.player.rotation - Math.PI / 2; // Adjust player's rotation to match the direction
        const boxX = this.player.x + followDistance * Math.cos(angle);
        const boxY = this.player.y + followDistance * Math.sin(angle);
  
        // Update the yellow box's position to follow behind the player
        this.yellowBox.setPosition(boxX, boxY);
      }
    }
  
    gameOver(player, asteroid) {
      // Optionally, for visual effect, hide the player and asteroid
      player.setVisible(false);
      asteroid.setVisible(false);
  
      // Stop physics to halt game movement
      this.physics.pause();
  
      // Display a game over message
      let gameOverText = this.add.text(this.player.x, this.player.y, 'Game Over\nHit ENTER to restart', { fontSize: '32px', fill: '#fff' });
      gameOverText.setOrigin(0.5);
  
      // Optional: Add a way to restart the game, e.g., by clicking
      this.input.keyboard.on('keydown-ENTER', () => {
        this.scene.restart(); // Restart the current scene
      });
  
      this.resetGame();
    }
  
    resetGame() {
      this.boxAttached = false; // Reset the flag
    }
  
    youWin() {
      let winText = this.add.text(this.player.x, this.player.y, 'You Win!', {
        fontSize: '64px',
        fill: '#ffffff'
      });
      winText.setOrigin(0.5, 0.5);
  
      this.physics.pause(); // Optionally pause the game
      // Any additional win logic...
    }
  
  
  }
  