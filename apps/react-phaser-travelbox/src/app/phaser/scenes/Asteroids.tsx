import Phaser from "phaser"
import { createStars } from "./utils/world";

const NUMBER_OF_ASTEROIDS = 50;
const NUMBER_OF_STARS = 500; // Adjust based on how dense you want the star background to be
const WORLD_HEIGHT = 3000;
const WORLD_WIDTH = 3000;

export class Asteroids extends Phaser.Scene {

  constructor() {
    super('Asteroids');
    this.asteroids = [];
  }

  create() {
    // make background black
    this.cameras.main.setBackgroundColor(0x000000);


    // Set up keyboard controls
    this.cursors = this.input.keyboard.createCursorKeys();

    // Create the player as a triangle in the center of the game
    this.player = this.add.triangle(400, 300, 0, -10, 10, 10, -10, 10, 0xffffff);
    this.physics.add.existing(this.player);

    // Adjust the origin of the triangle. Start with the geometric center and adjust if necessary
    this.player.setOrigin(0.1, 0.1); // Adjust this as needed

    const graphics = this.make.graphics({}, false);
    graphics.fillStyle(0xff0000, 1); // Set color to red
    graphics.fillRect(0, 0, 10, 10); // Draw a 10x10 square
    graphics.generateTexture('bulletTexture', 10, 10); // Generate a texture named 'bulletTexture'
    graphics.destroy(); // Clean up the graphics object

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT); // Adjust size as needed
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1); // Optional, adjust zoom level as needed

    // Now 'bulletTexture' can be used to create sprites
    this.bullets = this.physics.add.group({
      defaultKey: 'bulletTexture',
      maxSize: 20 // Adjust based on your needs
    });


    createStars(this, WORLD_WIDTH, WORLD_HEIGHT);

    // Make the player physics-enabled
    this.player.body.setDrag(100);
    this.player.body.setMaxVelocity(200);

    this.input.keyboard.on('keydown-SPACE', () => {
      // Get a bullet from the bullets group
      const bullet = this.bullets.get(this.player.x, this.player.y);

      if (bullet) {
        bullet.setActive(true).setVisible(true);
        bullet.body.setAllowGravity(false); // Ensure the bullet doesn't fall due to gravity
        this.physics.velocityFromRotation(this.player.rotation - Math.PI / 2, 400, bullet.body.velocity); // Propel the bullet
      }
    });

    // Generate some asteroids
    for (let i = 0; i < NUMBER_OF_ASTEROIDS; i++) {
      const x = Phaser.Math.Between(0, 800);
      const y = Phaser.Math.Between(0, 600);
      const asteroid = this.add.circle(x, y, Phaser.Math.Between(10, 20), 0x8B4513);
      this.physics.add.existing(asteroid);

      // Random velocity for the asteroid
      const velocityX = Phaser.Math.Between(-100, 100);
      const velocityY = Phaser.Math.Between(-100, 100);
      asteroid.body.setVelocity(velocityX, velocityY);

      this.asteroids.push(asteroid);
    }
    this.physics.add.collider(this.bullets, this.asteroids, (bullet, asteroid) => {
      bullet.destroy(); // Destroy the bullet
      asteroid.destroy(); // Destroy the asteroid
    }, null, this);


  }



  update() {
    // Checking keyboard input to rotate the player
    if (this.cursors.left?.isDown) {
      this.player.rotation -= 0.05; // Rotate left
    } else if (this.cursors.right?.isDown) {
      this.player.rotation += 0.05; // Rotate right
    }

    // Move forward
    if (this.cursors.up?.isDown) {
      this.physics.velocityFromRotation(this.player.rotation - Math.PI / 2, 200, this.player.body.velocity);
    } else {
      // Optionally, apply some drag to slow down when not accelerating
      this.player.body.setDrag(100);
    }
  }


}
