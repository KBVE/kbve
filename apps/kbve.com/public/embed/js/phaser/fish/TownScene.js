
console.log('Town Scene Loaded');

class TownScene extends Phaser.Scene {
    constructor() {
        super({ key: 'TownScene' });
    }

    preload() {
        // Load the fish sprite; ensure you have a 'fish.png' in the specified path
        this.load.image('fish', '/assets/img/letter_logo.png');

        
        this.load.image("tiles", "/assets/img/fishchip/cloud_tileset.png");
        this.load.tilemapTiledJSON(
            "cloud-city-map",
            "/assets/img/fishchip/cloud_city.json",
        );
        this.load.spritesheet("player", "/assets/img/fishchip/characters.png", {
            frameWidth: 52,
            frameHeight: 72,
        });
    
        this.load.sceneFile('FishChipScene', '/embed/js/phaser/fish/FishChipScene.js')

    }

    create() {

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
          ],
        };
        this.gridEngine.create(cloudCityTilemap, gridEngineConfig);

        window.__GRID_ENGINE__ = this.gridEngine;

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
          


        if(this.input.keyboard.addKey('F').isDown)
        {
            console.log('Action Key F was Pressed');
            let position = this.gridEngine.getPosition('player');
            let withinRange = isWithinRangeOfWell(position);
            console.log(withinRange);
            if(withinRange) {
                this.scene.start('FishChipScene');
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