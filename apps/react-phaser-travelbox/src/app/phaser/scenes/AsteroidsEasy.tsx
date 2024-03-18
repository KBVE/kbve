import Phaser from "phaser"
import { createStars } from "./utils/world";
import { incrementScore } from "./utils/score";

const NUMBER_OF_ASTEROIDS = 50;
const NUMBER_OF_STARS = 500; // Adjust based on how dense you want the star background to be
const WORLD_HEIGHT = 2000;
const WORLD_WIDTH = 2000;
const NUMBER_OF_ENEMIES = 1;

export class AsteroidsEasy extends Phaser.Scene {

  private asteroids: Phaser.GameObjects.Image[];
  private bullets: Phaser.Physics.Arcade.Group | null;
  private player: Phaser.GameObjects.Image | null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null;
  private enemies: Phaser.Physics.Arcade.Group | null;

  thrustSoundPlaying: boolean;
  thrustSound: Phaser.Sound.NoAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.WebAudioSound | undefined;
  yellowBox: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | undefined;
  blueCircle: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | undefined;
  enemyBullets: Phaser.Physics.Arcade.Group | undefined;
  boxAttached!: boolean;

  constructor() {
    super('AsteroidsEasy');
    this.asteroids = [];
    this.bullets = null;
    this.player = null;
    this.cursors = null;
    this.thrustSoundPlaying = false; // Add this line
    this.enemies = null; // Add this line in the constructor
    this.boxAttached = false; // Initialize the flag
  }

  preload() {
    this.load.image('potato', './asteroid_potato.png');
    this.load.image('earth', './earth.png');
    this.load.image('ship_still', './ship_still.png');
    this.load.image('ship_thrust', './ship_thrust.png');
    this.load.image('enemy', './enemy.png');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT, true, true, true, true);

    this.cursors = this.input.keyboard?.createCursorKeys() ?? null;

    this.createPlayer();
 
    this.setupCamera();

    if (this.player) {

      this.add.text(this.player.x - 200, this.player.y - 200, 'Cadet!\nWe have lost our cargo!\nFind it and bring it back to Mars!\nWishing you fortune!!!', { fontSize: '16px', color: '#fff' });

    }

    this.createPlayerBullets();

    createStars(this, WORLD_WIDTH, WORLD_HEIGHT, NUMBER_OF_STARS);

    this.createAsteroids();

    this.playerShoot();

    this.createPackage();

    this.createEarth();
    
    this.createEnemies();

    this.createEnemyBullets();

    this.handleCollisions();
  }

  update() {
    this.rotatePlayer();
    this.playerMoveForward();

    this.boxFollowPlayer();

    if (this.enemies) {
      this.enemies.children.iterate((enemy: any) => {
        this.enemyChasePlayer(enemy);
        this.enemyShootAtPlayer(enemy);
        return true; // Explicitly return true to continue iteration
      });
    }
  }

  private setupCamera() {
    this.cameras.main.setBackgroundColor(0x000000);
    if (this.player) { // Check if player is not null
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    }
    this.cameras.main.setZoom(1);
  }

  private createPlayer() {
    this.thrustSound = this.sound.add('thrust', { loop: true, volume: 0.1 });
    this.player = this.add.image(1000, 1000, 'ship_still');
    this.physics.add.existing(this.player);

    this.player.setOrigin(0.5, .5);

    // Use a type assertion to cast the body to an Arcade Body
    const arcadeBody = this.player.body as Phaser.Physics.Arcade.Body;

    arcadeBody.setDrag(100);
    arcadeBody.setMaxVelocity(200);
    arcadeBody.setCollideWorldBounds(true);
  }

  private createPlayerBullets() {
    const graphics = this.make.graphics({}, false);
    graphics.fillStyle(0xff0000, 1);
    graphics.fillRect(0, 0, 10, 10);
    graphics.generateTexture('bulletTexture', 10, 10);
    graphics.destroy();

    this.bullets = this.physics.add.group({
      defaultKey: 'bulletTexture',
      maxSize: 20
    });
  }

  private createAsteroids() {
    for (let i = 0; i < NUMBER_OF_ASTEROIDS; i++) {
      this.addAsteroid();
    }
  }

  private playerShoot() {
    if (this.input.keyboard) {

      this.input.keyboard.on('keydown-SPACE', () => {
        if (!this.bullets || !this.player) return;

        const bullet = this.bullets.get(this.player.x, this.player.y);
        this.sound.play('laser', { volume: 0.1 });
        if (bullet) {
          bullet.setActive(true).setVisible(true);
          bullet.setDepth(-99);
          bullet.body.setAllowGravity(false); // Ensure the bullet doesn't fall due to gravity
          this.physics.velocityFromRotation(this.player.rotation - Math.PI / 2, 400, bullet.body.velocity); // Propel the bullet

          bullet.body.setCollideWorldBounds(true); // Make bullet collide with world bounds
          bullet.body.onWorldBounds = true; // Enable world bounds event for the bullet

          // Automatically destroy the bullet when it goes out of bounds
          bullet.body.world.on('worldbounds', (body: { gameObject: any; }) => {
            if (body.gameObject === bullet) {
              bullet.destroy(); // Destroy the bullet
            }
          }, this);
        }
      });
    }
  }

  private createPackage() {
    const boxSize = 2.0; // Size of the square
    const boxX = Phaser.Math.Between(0, WORLD_WIDTH - boxSize);
    const boxY = Phaser.Math.Between(0, WORLD_HEIGHT - boxSize); 

    this.yellowBox = this.physics.add.sprite(boxX, boxY, 'box').setScale(boxSize);
  }

  private createEarth() {


    const circleX = Phaser.Math.Between(64, WORLD_WIDTH - 64);
    const circleY = Phaser.Math.Between(64, WORLD_HEIGHT - 64);
    this.blueCircle = this.physics.add.sprite(circleX, circleY, 'earth');
    this.blueCircle.tint = 0xff0000; // red
  }

  private createEnemyBullets() {
    // Create enemy bullets texture
    const enemyBulletGraphics = this.make.graphics({}, false);
    enemyBulletGraphics.fillStyle(0x00ff00, 1); // Green color for bullets
    enemyBulletGraphics.fillRect(0, 0, 10, 10); // Square bullets
    enemyBulletGraphics.generateTexture('enemyBulletTexture', 10, 10);
    enemyBulletGraphics.destroy();

    this.enemyBullets = this.physics.add.group({
      defaultKey: 'enemyBulletTexture',
      createCallback: (bullet) => {
        // Use a type assertion to treat the body as an ArcadePhysics.Body
        const arcadeBody = bullet.body as Phaser.Physics.Arcade.Body;
        arcadeBody.onWorldBounds = true;
      },
      removeCallback: (bullet) => {
        // Use a type assertion here as well
        const spriteBullet = bullet as Phaser.Physics.Arcade.Sprite;
        spriteBullet.setActive(false).setVisible(false);
      }
    });

    this.physics.world.on('worldbounds', (body: { gameObject: Phaser.Physics.Arcade.Sprite; }) => {
      // Ensure `this.enemyBullets` is defined before using it
      if (this.enemyBullets && this.enemyBullets.contains(body.gameObject)) {
        body.gameObject.setActive(false).setVisible(false);
      }
    });
  }

  private createEnemies() {
    this.enemies = this.physics.add.group({
      key: 'enemy',
      repeat: NUMBER_OF_ENEMIES,
      setXY: { x: 100, y: 100, stepX: 200 },
    });

    this.enemies.children.iterate((enemy: any) => {
      if (enemy.body) {
        enemy.setScale(0.5);
        enemy.body.setVelocity(Phaser.Math.Between(-50, 50), Phaser.Math.Between(-50, 50));
        enemy.body.setCollideWorldBounds(true);
      }
      return null; // Explicitly return null
    });
  }

  private handleCollisions() {

    if (this.player && this.yellowBox) {
      this.physics.add.overlap(this.player, this.yellowBox, (player, box) => {
        this.attachBoxToPlayer(box);
      }, undefined, this); // Use `undefined` instead of `null`, or just omit it entirely
    }

    // Player collides with Earth
    // this.physics.add.overlap(this.player, this.blueCircle, () => {
    //   if (this.boxAttached) { // Check if the box is attached to the player
    //     this.youWin();
    //   }
    // }, null, this);

    if (this.player && this.blueCircle) {
      this.physics.add.overlap(this.player, this.blueCircle, () => {
        if (this.boxAttached) { // Check if the box is attached to the player
          this.youWin();
        }
      }, undefined, this);
    }



    // this.physics.add.collider(this.player, this.enemyBullets, (player, bullet) => {
    //   bullet.setActive(false).setVisible(false);
    //   this.gameOver(player, bullet);
    // }, null, this);
    if (this.player && this.enemyBullets) {
      this.physics.add.collider(this.player, this.enemyBullets, (player, bullet) => {
        // Check or assert the type of `bullet` if necessary
        if (bullet instanceof Phaser.GameObjects.Sprite) {
          // Now that we've asserted `bullet` is a Sprite, we can safely call Sprite-specific methods
          bullet.setActive(false).setVisible(false);
        }
        // Since `player` is being used without directly calling methods that might not exist on `Tile`,
        // no type assertion is necessary for `player`. However, if you need to call specific methods,
        // you should perform similar checks or assertions.

        // Assuming `gameOver` can accept these types; otherwise, you might need to adjust its parameters or perform type checks
        // this.gameOver(player, bullet);
        this.gameOver();

      }, undefined, this);
    }



    // this.physics.add.collider(this.bullets, this.asteroids, (bullet, asteroid) => {
    //   bullet.destroy(); // Destroy the bullet
    //   asteroid.destroy(); // Destroy the asteroid
    // }, undefined, this);
    if (this.bullets && this.asteroids) {
      this.physics.add.collider(this.bullets, this.asteroids, (bullet, asteroid) => {
        // Assuming `bullet` and `asteroid` are properly typed or casted within this block,
        // you can now safely call methods like `destroy` on them.
        bullet.destroy(); // Destroy the bullet
        asteroid.destroy(); // Destroy the asteroid
      }, undefined, this);
    }



    //this.physics.add.collider(this.player, this.asteroids, this.gameOver, null, this);
    if (this.player && this.asteroids) {
      this.physics.add.collider(this.player, this.asteroids, this.gameOver, undefined, this);
    }

    // Add this in the create method, after initializing enemyBullets
    if (this.player && this.enemyBullets) {
      this.physics.add.collider(this.player, this.enemyBullets, this.gameOver, undefined, this);
    }



    // Add this in the create method, after initializing enemies
    if (this.player && this.enemies) {
      this.physics.add.collider(this.player, this.enemies, this.gameOver, undefined, this);
    }


    if (this.bullets && this.enemies) {
      this.physics.add.collider(this.bullets, this.enemies, (bullet, enemy) => {
        bullet.destroy(); // Destroy the bullet
        enemy.destroy(); // Destroy the asteroid
      }, undefined, this);
    }


    if (this.enemyBullets) {
      this.physics.add.collider(this.enemyBullets, this.asteroids, (bullet, asteroid) => {
        bullet.destroy(); // Destroy the bullet
        asteroid.destroy(); // Destroy the asteroid
      }, undefined, this);
    }
  }

  // private attachBoxToPlayer(box: Phaser.Tilemaps.Tile | Phaser.Types.Physics.Arcade.GameObjectWithBody) {
  //   box.body.setEnable(false); // Disable physics
  //   this.boxAttached = true; // Flag to check in the update loop
  // }

  // private attachBoxToPlayer(box: Phaser.Tilemaps.Tile | Phaser.Types.Physics.Arcade.GameObjectWithBody) {
  //   // Check if 'box' is a GameObjectWithBody
  //   if ("body" in box) {
  //     box.body.setEnable(false); // Disable physics
  //     this.boxAttached = true; // Flag to check in the update loop
  //   }
  // }

  private attachBoxToPlayer(box: Phaser.Tilemaps.Tile | Phaser.Types.Physics.Arcade.GameObjectWithBody) {
    // Ensure 'box' has a 'body' and it's not null
    if ("body" in box && box.body !== null) {
      // Dynamically check if the body is of type Arcade Body and disable it
      if (box.body instanceof Phaser.Physics.Arcade.Body) {
        box.body.enable = false;
      } else if (box.body instanceof Phaser.Physics.Arcade.StaticBody) {
        // For StaticBody, you might handle them differently as they don't have an `enable` property
        // Static bodies are typically manipulated by directly manipulating their game object
        console.log("Static body encountered. Consider how you want to handle static bodies.");
      }
      this.boxAttached = true; // Flag to check in the update loop
    }
  }


  // private addAsteroid() {
  //   const cameraBounds = this.cameras.main.getBounds();

  //   // Define margins outside the camera view where asteroids can spawn
  //   const margin = 25; // Distance outside the camera view

  //   // Calculate safe spawn zones bafsed on the camera view
  //   let x, y;
  //   if (Phaser.Math.Between(0, 1)) {
  //     // Spawn to the left or right of the camera view
  //     x = Phaser.Math.Between(0, 1) ? cameraBounds.left - margin : cameraBounds.right + margin;
  //     y = Phaser.Math.Between(0, WORLD_HEIGHT);
  //   } else {
  //     // Spawn above or below the camera view
  //     x = Phaser.Math.Between(0, WORLD_WIDTH);
  //     y = Phaser.Math.Between(0, 1) ? cameraBounds.top - margin : cameraBounds.bottom + margin;
  //   }

  //   // Ensure x and y are within world bounds
  //   x = Phaser.Math.Clamp(x, 0, WORLD_WIDTH);
  //   y = Phaser.Math.Clamp(y, 0, WORLD_HEIGHT);

  //   const asteroid = this.add.circle(x, y, Phaser.Math.Between(10, 20), 0x8B4513);
  //   this.physics.add.existing(asteroid);

  //   const velocityX = Phaser.Math.Between(-100, 100);
  //   const velocityY = Phaser.Math.Between(-100, 100);
  //   asteroid.body.setVelocity(velocityX, velocityY);

  //   asteroid.body.setCollideWorldBounds(true);
  //   asteroid.body.onWorldBounds = true; // Enable world bounds collision event for this body

  //   // Listen for the world bounds event
  //   asteroid.body.world.on('worldbounds', (body: { gameObject: Phaser.GameObjects.Arc; }) => {
  //     if (body.gameObject === asteroid) {
  //       asteroid.destroy(); // Destroy the asteroid
  //       this.addAsteroid(); // Add a new asteroid
  //     }
  //   }, this);

  //   this.asteroids.push(asteroid);
  // }


  private addAsteroid() {
    const cameraBounds = this.cameras.main.getBounds();
    const margin = 25; // Distance outside the camera view

    let x, y;
    if (Phaser.Math.Between(0, 1)) {
      x = Phaser.Math.Between(0, 1) ? cameraBounds.left - margin : cameraBounds.right + margin;
      y = Phaser.Math.Between(0, WORLD_HEIGHT);
    } else {
      x = Phaser.Math.Between(0, WORLD_WIDTH);
      y = Phaser.Math.Between(0, 1) ? cameraBounds.top - margin : cameraBounds.bottom + margin;
    }

    x = Phaser.Math.Clamp(x, 0, WORLD_WIDTH);
    y = Phaser.Math.Clamp(y, 0, WORLD_HEIGHT);

    // create asteroid using potato image
    const asteroid = this.add.image(x, y, 'potato');
    // set asteroid origin
    asteroid.setOrigin(0.5, 0.5);

    // set random scale .7 to .99
    asteroid.setScale(Phaser.Math.Between(3, 9) / 10);

    this.physics.add.existing(asteroid);
    const body = asteroid.body as Phaser.Physics.Arcade.Body;

    //rotate the asteroid slowly
    body.setAngularVelocity(Phaser.Math.Between(-50, 50));

    // Set velocity, world bounds collision, and enable world bounds event
    const velocityX = Phaser.Math.Between(-100, 100);
    const velocityY = Phaser.Math.Between(-100, 100);
    body.setVelocity(velocityX, velocityY);
    body.setCollideWorldBounds(true);
    body.onWorldBounds = true; // Enable world bounds collision event

    // Listen for the world bounds event on this specific body
    body.world.on('worldbounds', (bodyEvent: Phaser.Physics.Arcade.Body) => {
      if (bodyEvent.gameObject === asteroid) {
        asteroid.destroy();
        this.addAsteroid(); // Recursively add a new asteroid
      }
    }, this);

    this.asteroids.push(asteroid);
  }




  // private enemyShootAtPlayer(enemy: any) {
  //   if (Phaser.Math.Between(0, 1000) > 999) {
  //     const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
  //     const bullet = this.enemyBullets.get(enemy.x, enemy.y);
  //     if (bullet) {
  //       bullet.setActive(true).setVisible(true);
  //       this.physics.velocityFromRotation(angle, 300, bullet.body.velocity);
  //     }
  //   }
  // }

  private enemyShootAtPlayer(enemy: any) {
    // Ensure `this.player` and `this.enemyBullets` are not null
    if (this.player && this.enemyBullets) {
      if (Phaser.Math.Between(0, 1000) > 999) {
        // Now safe to assume `this.player` is not null
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);

        // Attempt to get a bullet from the enemyBullets group
        const bullet = this.enemyBullets.get(enemy.x, enemy.y) as Phaser.Physics.Arcade.Sprite;

        if (bullet) {
          bullet.setActive(true).setVisible(true);
          bullet.setDepth(-99); // Ensure the bullet is behind other objects
          // Ensure `bullet.body` is treated as an Arcade physics body
          // This assumes `bullet` is an instance of `Phaser.Physics.Arcade.Sprite`
          if (bullet.body instanceof Phaser.Physics.Arcade.Body) {
            this.physics.velocityFromRotation(angle, 300, bullet.body.velocity);
          } else {
            console.error('Bullet body is not an instance of Phaser.Physics.Arcade.Body');
          }
        }
      }
    } else {
      console.error('Player or enemyBullets group is null');
    }
  }



  // private enemyChasePlayer(enemy: any) {
  //   this.physics.accelerateToObject(enemy, this.player, 50);
  // }

  private enemyChasePlayer(enemy: any) {
    // Ensure this.player is not null before proceeding
    if (this.player) {
      this.physics.accelerateToObject(enemy, this.player, 50);
    } else {
      // Optionally, handle the case where this.player is null, such as by logging an error or taking alternative actions
      console.warn("Player object is null, cannot chase player.");
    }
  }


  private boxFollowPlayer() {
    if (this.boxAttached && this.player && this.yellowBox) {
      // Distance behind the player for the box to follow
      const followDistance = 60;

      // Calculate the position behind the player
      const angle = this.player.rotation - Math.PI / 2; // Adjust player's rotation to match the direction
      const boxX = this.player.x + followDistance * Math.cos(angle);
      const boxY = this.player.y + followDistance * Math.sin(angle);

      // Update the yellow box's position to follow behind the player
      this.yellowBox.setPosition(boxX, boxY);
    }
  }

  // private playerMoveForward() {
  //   if (this.cursors?.up?.isDown) {
  //     this.physics.velocityFromRotation(this.player.rotation - Math.PI / 2, 200, this.player.body.velocity);
  //     if (!this.thrustSoundPlaying) {
  //       this.thrustSound.play();
  //       this.thrustSoundPlaying = true; // Update the flag
  //     }
  //   } else {
  //     if (this.thrustSoundPlaying) {
  //       this.thrustSound.pause();
  //       this.thrustSoundPlaying = false; // Update the flag
  //     }
  //     this.player.body.setDrag(100);
  //   }
  // }

  private playerMoveForward() {
    if (this.player && this.player.body instanceof Phaser.Physics.Arcade.Body) {
      if (this.cursors?.up?.isDown) {
        this.physics.velocityFromRotation(this.player.rotation - Math.PI / 2, 200, this.player.body.velocity);

        // Play thrust sound and change texture to show thrust.
        if (!this.thrustSoundPlaying && this.thrustSound) {
          this.thrustSound.play();
          this.thrustSoundPlaying = true;
          // Change the player texture to show thrust
          this.player.setTexture('ship_thrust');
        }
      } else {
        // Pause thrust sound and change texture back to still image.
        if (this.thrustSoundPlaying && this.thrustSound) {
          this.thrustSound.pause();
          this.thrustSoundPlaying = false;
          // Change the player texture back to the normal state
          this.player.setTexture('ship_still');
        }
        this.player.body.setDrag(100);
      }
    } else {
      console.warn("Player or player body is not initialized.");
    }
  }


  // Yay!

  // private rotatePlayer() {
  //   if (this.cursors?.left?.isDown) {
  //     this.player.rotation -= 0.05; // Rotate left
  //   } else if (this.cursors?.right?.isDown) {
  //     this.player.rotation += 0.05;
  //   }
  // }

  private rotatePlayer() {
    // Check if `this.player` is not null before attempting to access its properties
    if (this.player) {
      if (this.cursors?.left?.isDown) {
        this.player.rotation -= 0.05; // Rotate left
      } else if (this.cursors?.right?.isDown) {
        this.player.rotation += 0.05; // Rotate right
      }
    } else {
      // Optionally, handle the scenario where `this.player` is null
      console.warn("Player object is null, cannot rotate player.");
    }
  }

  // Updating GameOver

  private gameOver() {
    // Stop physics to halt game movement
    this.physics.pause();

    if (this.player) {
      // Display a game over message
      const gameOverText = this.add.text(this.player.x, this.player.y, 'Game Over\nHit ENTER to restart\nESC to return to space.', { fontSize: '32px', color: '#fff' });
      gameOverText.setOrigin(0.5);
    }

    if (this.input.keyboard) {
      // Optional: Add a way to restart the game
      this.input.keyboard.on('keydown-ENTER', () => {
        this.scene.restart();
      });

      this.input.keyboard.on('keydown-ESC', () => {
        this.scene.start('Space');
      }
      );
    }

    this.resetGame();
  }





  private resetGame() {
    this.boxAttached = false; // Reset the flag
  }

  private youWin() {

    if (this.player) {
      const winText = this.add.text(this.player.x, this.player.y, 'Mission Complete!\nGreat work cadet!\nPress ENTER to return back to port.', {
        fontSize: '16px',
        color: '#ffffff'
      });
      incrementScore();
      this.resetGame();
      winText.setOrigin(0.5, 0.5);
      this.physics.pause(); // Optionally pause the game
      if (this.input.keyboard) {
        this.input.keyboard.on('keydown-ENTER', () => {
          this.scene.restart();
          this.scene.start('Space');
        });
      }
    }
  }


}
