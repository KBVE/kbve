import { Scene } from 'phaser';

export class TownScene extends Scene {
  constructor() {
    super({ key: 'TownScene' });
  }

  create() {
    const cloudCityTilemap = this.make.tilemap({ key: "cloud-city-map" });
    cloudCityTilemap.addTilesetImage("Cloud City", "tiles");
    for (let i = 0; i < cloudCityTilemap.layers.length; i++) {
      const layer = cloudCityTilemap.createLayer(i, "Cloud City", 0, 0);
      layer.scale = 3;
    }
    const playerSprite = this.add.sprite(0, 0, "player");
    playerSprite.scale = 1.5;

    this.npcSprite = this.add.sprite(0, 0, "player");
    this.npcSprite.scale = 1.5;

    this.npcSprite = this.add.sprite(0, 0, "player");
    this.npcSprite.scale = 1.5;

    this.fishNpcSprite = this.add.sprite(0, 0, "player");
    this.fishNpcSprite.scale = 1.5;

    this.cameras.main.startFollow(playerSprite, true);
    this.cameras.main.setFollowOffset(
      -playerSprite.width,
      -playerSprite.height,
    );

    const gridEngineConfig = {
      characters: [
        {
          id: "player",
          sprite: playerSprite,
          walkingAnimationMapping: 6,
          startPosition: { x: 5, y: 12 }, //Initial position 8,8, Lamp position 14 x, 11 y
        },
        {
          id: "npc",
          sprite: this.npcSprite,
          walkingAnimationMapping: 5,
          startPosition: { x: 4, y: 10 }, //Initial position 8,8
          speed: 3,
        },
        {
          id: "fishNpc",
          sprite: this.fishNpcSprite,
          walkingAnimationMapping: 4,
          startPosition: { x: 8, y: 14 }, //Initial position 8,8
          speed: 3,
        },
      ],
    };
    this.gridEngine.create(cloudCityTilemap, gridEngineConfig);
    const totalScore = JSON.parse(localStorage.getItem('totalScore')) || 0;
    this.createTextBubble(this.npcSprite, "Enter the sand pit to start fishing! Go near it and press F!");
    this.createTextBubble(this.fishNpcSprite, `You have caught a total of ${totalScore} fish!`);
    this.gridEngine.moveRandomly("npc", 1500, 3);
    this.gridEngine.moveRandomly("fishNpc", 1500, 3);
    window.__GRID_ENGINE__ = this.gridEngine;

  }

  createTextBubble(sprite, text) {
    let bubbleWidth = 200;
    let bubbleHeight = 60;
    let bubblePadding = 10;

    let bubble = this.add.graphics();
    bubble.fillStyle(0xffffff, 1);
    bubble.fillRoundedRect(0, 0, bubbleWidth, bubbleHeight, 16);
    bubble.setDepth(99);

    let content = this.add.text(100, 30, text, { fontFamily: 'Arial', fontSize: 16, color: '#000000' });
    content.setOrigin(0.5);
    content.setWordWrapWidth(bubbleWidth - bubblePadding * 2);
    content.setDepth(100);

    let container = this.add.container(0, 0, [bubble, content]);
    container.setDepth(100);

    sprite.textBubble = container;
    this.updateTextBubblePosition(sprite);
  }

  updateTextBubblePosition(sprite) {
    let container = sprite.textBubble;

    container.x = sprite.x;
    container.y = sprite.y - sprite.height - container.height / 2;
  }

  update() {
    const cursors = this.input.keyboard.createCursorKeys();

    function isWithinRangeOfWell(point) {
      // Define the bounds
      const xMin = 2, xMax = 5;
      const yMin = 10, yMax = 14;

      // Check if the point is within the bounds
      return point.x >= xMin && point.x <= xMax &&
        point.y >= yMin && point.y <= yMax;
    }

    function isWithinRangeOfSign(point) {
      // Define the bounds
      const xMin = 2, xMax = 5;
      const yMin = 2, yMax = 5;

      // Check if the point is within the bounds
      return point.x >= xMin && point.x <= xMax &&
        point.y >= yMin && point.y <= yMax;
    }

    function isWithinRangeOfBuilding(point) {
      // Define the bounds
      const xMin = 13, xMax = 13;
      const yMin = 6, yMax = 7;

      // Check if the point is within the bounds
      return point.x >= xMin && point.x <= xMax &&
        point.y >= yMin && point.y <= yMax;
    }

    function isWithinRangeOfTombstone(point) {
      //  Define the bounds
      const xMin = 7, xMax = 10
      const yMin = 9, yMax = 10
      // Check if the point is within the bounds
      return point.x >= xMin && point.x <= xMax &&
        point.y >= yMin && point.y <= yMax;
    }



    if (this.input.keyboard.addKey('F').isDown) {
      let position = this.gridEngine.getPosition('player');

      let withinRangeOfWell = isWithinRangeOfWell(position);
      if (withinRangeOfWell) {
        this.scene.start('FishChipScene');
      }

      let withinRangeOfSign = isWithinRangeOfSign(position);
      if (withinRangeOfSign) {
        this.scene.start('CreditsScene');
      }

      let withinRangeOfBuilding = isWithinRangeOfBuilding(position);
      if (withinRangeOfBuilding) {
        console.log('Enter the Building?');
      }

      let withinRangeOfTombstone = isWithinRangeOfTombstone(position);
      if (withinRangeOfTombstone) {
        console.log('Samson Statue!');
      }
    }
    // Incase we need W A S D -> this.input.keyboard.addKey('A').isDown)
    if (cursors.left.isDown || this.input.keyboard.addKey('A').isDown) {
      this.gridEngine.move("player", "left");
    } else if (cursors.right.isDown || this.input.keyboard.addKey('D').isDown) {
      this.gridEngine.move("player", "right");
    } else if (cursors.up.isDown || this.input.keyboard.addKey('W').isDown) {
      this.gridEngine.move("player", "up");
    } else if (cursors.down.isDown || this.input.keyboard.addKey('S').isDown) {
      this.gridEngine.move("player", "down");
    }

    // Update the speech bubble positions for both NPCs
    if (this.npcSprite && this.npcSprite.textBubble) {
      this.updateTextBubblePosition(this.npcSprite);
    }
    if (this.fishNpcSprite && this.fishNpcSprite.textBubble) {
      this.updateTextBubblePosition(this.fishNpcSprite);
    }
  }
}
