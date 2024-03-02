
class TownScene extends Phaser.Scene {
    constructor() {
        super({ key: 'TownScene' });
    }

    preload() {
        // Load the fish sprite; ensure you have a 'fish.png' in the specified path
        this.load.image('fish', '/assets/img/letter_logo.png');
        this.load.audio('music', '/assets/img/fishchip/bg.wav');
        
        this.load.image("tiles", "/assets/img/fishchip/cloud_tileset.png");
        this.load.tilemapTiledJSON(
            "cloud-city-map",
            "/assets/img/fishchip/cloud_city.json",
        );
        this.load.spritesheet("player", "/assets/img/fishchip/characters.png", {
            frameWidth: 52,
            frameHeight: 72,
        });
        if (!this.scene.get('FishChipScene')) { // Check if the scene isn't already added
          this.load.sceneFile('FishChipScene', '/embed/js/phaser/fish/FishChipScene.js')
        }
        

    }

    create() {
        if (!this.sound.get('music')?.isPlaying) {
          this.sound.add('music', { loop: true, volume: 0.1 }).play();
        }
        // this.gridEngine = this.plugins.get('gridEngine');
        console.log(this.gridEngine);
        console.log('Plugins?');

        // console.log(this.plugins); -> Plugin Works

        const cloudCityTilemap = this.make.tilemap({ key: "cloud-city-map" });
        cloudCityTilemap.addTilesetImage("Cloud City", "tiles");
        for (let i = 0; i < cloudCityTilemap.layers.length; i++) {
          const layer = cloudCityTilemap.createLayer(i, "Cloud City", 0, 0);
          layer.scale = 3;
        }
        const playerSprite = this.add.sprite(0, 0, "player");
        playerSprite.scale = 1.5;

        const npcSprite = this.add.sprite(0, 0, "player");
        npcSprite.scale = 1.5;
        
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
              startPosition: { x: 14, y: 11 }, //Initial position 8,8
            },
            {
              id: "npc",
              sprite: npcSprite,
              walkingAnimationMapping: 5,
              startPosition: { x: 4, y: 10 }, //Initial position 8,8
              speed: 3,
            },
          ],
        };
        this.gridEngine.create(cloudCityTilemap, gridEngineConfig);
        this.createTextBubble(npcSprite.x, npcSprite.y, npcSprite.height, "Start fishing here! Press F");
        this.gridEngine.moveRandomly("npc", 1500, 3);
        window.__GRID_ENGINE__ = this.gridEngine;

    }

    createTextBubble(x, y, height, text) {
      // Draw the bubble
      let bubbleWidth = 200; // Adjust based on your text length
      let bubbleHeight = 50; // Adjust as needed
      let bubblePadding = 10;
      let bubble = this.add.graphics({ x: x, y: y });
  
      // Bubble color and shape
      bubble.fillStyle(0xffffff, 0.7);
      bubble.fillRoundedRect(0, 0, bubbleWidth, bubbleHeight, 16);
      bubble.setDepth(99);
  
      // Position text inside the bubble
      let content = this.add.text(0, 0, text, { fontFamily: 'Arial', fontSize: 16, color: '#000000' });
      content.setPosition(bubble.x + bubblePadding, bubble.y + bubblePadding / 2);
      content.setWordWrapWidth(bubbleWidth - bubblePadding * 2);
      content.setDepth(100);
      // Adjust the position based on the NPC sprite's position and the desired offset
      bubble.x = x - bubbleWidth / 24;
      bubble.y = y - bubbleHeight - height / 24; // Adjust this offset based on your needs
      content.x = bubble.x + bubblePadding;
      content.y = bubble.y + bubblePadding;
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
          


        if(this.input.keyboard.addKey('F').isDown)
        {
            console.log('Action Key F was Pressed');
            let position = this.gridEngine.getPosition('player');
            console.log(position);



            let withinRangeOfWell = isWithinRangeOfWell(position);
            if(withinRangeOfWell) {
                this.scene.start('FishChipScene');
            }

            let withinRangeOfBuilding = isWithinRangeOfBuilding(position);
            if(withinRangeOfBuilding) {
                console.log('Enter the Building?');
            } 

            let withinRangeOfTombstone = isWithinRangeOfTombstone(position);
            if(withinRangeOfTombstone) {
                console.log('Samson Statue!');
            } 
        }
        // Incase we need W A S D -> this.input.keyboard.addKey('A').isDown) 
        if (cursors.left.isDown) {
          this.gridEngine.move("player", "left");
        } else if (cursors.right.isDown) {
          this.gridEngine.move("player", "right");
        } else if (cursors.up.isDown) {
          this.gridEngine.move("player", "up");
        } else if (cursors.down.isDown) {
          this.gridEngine.move("player", "down");
        } 
    }
}

window.TownScene = TownScene;