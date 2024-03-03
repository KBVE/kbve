// import { Scene } from 'phaser';
const FISH_LIST = [
    "Angelfish",
    "Barracuda",
    "Clownfish",
    "Damselfish",
    "Eel",
    "Flounder",
    "Guppy",
    "Haddock",
    "Iridescent Shark",
    "Jellynose Fish",
    "Koi",
    "Lionfish",
    "Mackerel",
    "Nurse Shark",
    "Oscar",
    "Pufferfish",
    "Quillback",
    "Rasbora",
    "Salmon",
    "Tilapia",
    "Uaru",
    "Vampire Tetra",
    "Wrasse",
    "X-ray Tetra",
    "Yellowtail",
    "Zebrafish",
    "Arowana",
    "Blue Tang",
    "Catfish",
    "Dorado",
    "Electric Eel",
    "Flying Fish",
    "Goldfish",
    "Halibut",
    "Icefish",
    "Jack Dempsey",
    "Killifish",
    "Loach",
    "Mudskipper",
    "Neon Tetra",
    "Octopus Squid",
    "Pirarucu",
    "Queen Triggerfish",
    "Rainbow Trout",
    "Swordfish",
    "Triggerfish",
    "Unicorn Fish",
    "Velvetfish",
    "Whale Shark",
    "Yellowfin Tuna",
    "Albacore Tuna",
    "Bluefin Tuna",
    "Chinook Salmon",
    "Dolly Varden Trout",
    "Epaulette Shark",
    "French Angelfish",
    "Green Swordtail",
    "Humpback Angelfish",
    "Ivory Goby",
    "Jade Goby",
    "Kelp Bass",
    "Lemon Shark",
    "Midnight Angelfish",
    "Northern Pike",
    "Olive Flounder",
    "Pacific Halibut",
    "Queen Snapper",
    "Red Drum",
    "Spotted Seatrout",
    "Tiger Barb",
    "Violet Goby",
    "White Sturgeon",
    "Xingu River Ray",
    "Yellow Perch",
    "Zebra Danio",
    "Amberjack",
    "Black Molly",
    "Dragonet",
    "Emperor Angelfish",
    "Firefish",
    "Ghost Knifefish",
    "Hogfish",
    "Indian Glassy Fish",
    "Jewelfish",
    "Knifefish",
    "Longfin Bannerfish",
    "Maroon Clownfish",
    "Nightfish",
    "Pink Salmon",
    "Quagga Catfish",
    "Rusty Cichlid",
    "Silver Dollar",
    "Turquoise Discus",
    "Upland Bully",
    "Velvet Crab",
    "Wobbegong Shark",
    "Xenon Blue Cichlid",
    "Zigzag Eel",
    "African Lungfish",
    "Banded Archerfish",
    "Candy Basslet",
    "Dwarf Gourami",
    "Electric Blue Hap",
    "Firemouth Cichlid",
    "Golden Dojo Loach",
    "Horn Shark",
    "Indian Glassfish",
    "Jaguar Cichlid",
    "Kissing Gourami",
    "Lemon Cichlid",
    "Midas Cichlid",
    "Nile Tilapia",
    "Oscar Cichlid",
    "Pajama Cardinalfish",
    "Queen Parrotfish",
    "Redtail Catfish",
    "Sailfin Tang",
    "Tiger Oscar",
    "Upside-down Catfish",
    "Wrasse Bass",
    "Yellow Tang",
    "Zebra Pleco",
    "Bala Shark",
    "Clown Loach",
    "Dwarf Pufferfish",
    "Fire Eel",
    "Giant Gourami",
    "Humphead Glassfish",
    "Indian Tigerfish",
    "Jewel Cichlid",
    "Kuhli Loach",
    "Lemon Tetra",
    "Mbu Puffer",
    "Niger Triggerfish",
    "Otocinclus Catfish",
    "Panda Corydoras",
    "Queen Loach",
    "Redtail Shark",
    "Sailfin Molly",
    "Tiger Barb",
    "Upside-down Catfish",
    "Wrasse Bass",
    "Yellow Tang",
    "Zebra Pleco",
    "Bala Shark",
    "Clown Loach",
    "Dwarf Pufferfish",
    "Fire Eel",
    "Giant Gourami",
    "Humphead Glassfish",
    "Indian Tigerfish",
    "Jewel Cichlid",
    "Kuhli Loach",
    "Lemon Tetra",
    "Mbu Puffer",
    "Niger Triggerfish",
    "Otocinclus Catfish",
    "Panda Corydoras",
    "Queen Loach",
    "Redtail Shark",
    "Sailfin Molly",
    "Tiger Barb",
    "Upside-down Catfish",
    "Wrasse Bass",
    "Yellow Tang",
    "Zebra Pleco",
    "Bala Shark",
    "Clown Loach",
    "Dwarf Pufferfish",
    "Fire Eel",
    "Giant Gourami",
    "Humphead Glassfish",
    "Indian Tigerfish",
    "Jewel Cichlid",
    "Kuhli Loach",
    "Lemon Tetra",
    "Mbu Puffer",
    "Niger Triggerfish",
    "Otocinclus Catfish",
    "Panda Corydoras",
    "Queen Loach",
    "Redtail Shark",
    "Sailfin Molly",
    "Tiger Barb",
    "Upside-down Catfish",
    "Wrasse Bass",
    "Yellow Tang",
    "Zebra Pleco",
    "Bala Shark",
    "Clown Loach",
    "Dwarf Pufferfish",
    "Fire Eel",
    "Giant Gourami",
    "Humphead Glassfish",
    "Indian Tigerfish",
    "Jewel Cichlid",
    "Kuhli Loach",
    "Lemon Tetra",
    "Mbu Puffer",
    "Niger Triggerfish",
    "Otocinclus Catfish",
    "Panda Corydoras",
    "Queen Loach",
    "Redtail Shark",
    "Sailfin Molly",
    "Tiger Barb",
    "Upside-down Catfish",
    "Wrasse Bass"
]

const DIFFICULTY = 3; // Increase the difficulty by adding more characters to the combo

class FishChipScene extends Phaser.Scene {
    constructor() {
        super('FishChipScene');
        this.combo = [];
        this.userInput = [];
        this.score = 0;
        this.comboTextObjects = []; // Store text objects for each combo character
        this.startTime = null; // Track start time of typing
        this.correctChars = 0; // Track number of correct characters typed
        this.wpm = 0;
    }

    preload() {
        //  Load the assets for the game - Replace with your own assets
        //this.load.setPath('/assets/img/fishchip');

        
        this.load.audio('type', '/assets/img/fishchip/type.mp3');
        

        //load spritesheet for fishing.png
        this.load.spritesheet('fishing', '/assets/img/fishchip/fishing.png', { frameWidth: 480, frameHeight: 480 });

        if (!this.scene.get('GameOver')) { // Check if the scene isn't already added
            this.load.sceneFile('GameOver', '/embed/js/phaser/fish/GameOver.js')
        }
    }

    resetGameState() {
        this.combo = [];
        this.userInput = [];
        this.score = 0;

        // Reset score text
        this.scoreText.setText('Score: ' + this.score);

        this.comboTextObjects.forEach(textObj => textObj.destroy()); // Clear previous combo texts
        this.comboTextObjects = [];

        this.startTime = null; // Track start time of typing
        this.correctChars = 0; // Track number of correct characters typed
        this.wpm = 0;
        this.timerText.setText('');
        if (this.countdownEvent) this.countdownEvent.remove();
    }

    startComboSequence() {
        this.combo = this.generateCombo();
        this.userInput = [];

        // Setup countdown timer
        this.timeLeft = 20; // 20 seconds for the countdown
        this.timerText.setText(`Time Left: ${this.timeLeft}s`);

        // Update the timer every second
        if (this.countdownEvent) this.countdownEvent.remove();
        this.countdownEvent = this.time.addEvent({
            delay: 1000,
            callback: () => {
                this.timeLeft--;
                this.timerText.setText(`Time Left: ${this.timeLeft}s`);

                if (this.timeLeft <= 0) {
                    this.checkCombo(true); // Force check combo if time runs out
                }
            },
            callbackScope: this,
            loop: true
        });
        // Display combo
        this.displayCombo();
    }

    displayCombo() {
        // First, clear any existing combo text objects
        this.comboTextObjects.forEach(textObj => textObj.destroy());
        this.comboTextObjects = [];

        let startX = 480 - (this.combo.length * 20); // Example starting X calculation

        this.combo.forEach((char, index) => {
            // Before creating a new text object, ensure there's not already one at this index
            if (!this.comboTextObjects[index]) {
                const textObj = this.add.text(startX + (index * 40), 384, char, {
                    fontFamily: 'Arial Black', fontSize: 48, color: '#ffffff',
                    stroke: '#000000', strokeThickness: 8,
                    align: 'center'
                }).setOrigin(0.5);

                this.comboTextObjects[index] = textObj;
            }
        });
    }


    gameOver() {
        if (this.countdownEvent) this.countdownEvent.remove();
        this.scene.start('GameOver', { score: this.score, wpm: this.wpm });
    }

    handleInput(key) {
        if (!this.startTime) {
            this.startTime = Date.now(); // Set start time on first input
        }

        // Check if the game has already started with a combo
        if (this.combo.length > 0) {
            const expectedKey = this.combo[this.userInput.length]; // Get the expected key from the combo

            if (key === expectedKey) {
                // If key matches the expected part of the combo
                this.userInput.push(key); // Add the correct key to userInput

                // Update the color of the matched character to green
                if (this.comboTextObjects[this.userInput.length - 1]) {
                    this.comboTextObjects[this.userInput.length - 1].setColor('#00ff00');
                }

                // Increment correct characters count for WPM calculation
                this.correctChars++;

                if (this.userInput.length === this.combo.length) {
                    this.checkCombo();
                }
            } else {
                // If key does not match, end the game immediately
                this.gameOver();
            }
        }
    }


    calculateWPM() {
        const currentTime = Date.now();
        const timeElapsedInMinutes = (currentTime - this.startTime) / 60000; // Convert time from milliseconds to minutes
        const wpm = this.correctChars / 5 / timeElapsedInMinutes; // Divide by 5 as one word is considered to be 5 chars
        return wpm.toFixed(0); // Return WPM rounded to two decimal places
    }


    generateCombo() {
        // get a random fish from FISH_LIST
        const fish = FISH_LIST[Math.floor(Math.random() * FISH_LIST.length)];
        return fish.toUpperCase().split('');
    }

    generateCompliments() {
        const compliments = ["Great job!", "You're doing great!", "Keep it up!", "You're a typing machine!", "You're a typing wizard!", "You're a typing master!", "You're a typing prodigy!", "You're a typing genius!", "You're a typing god!", "You're a typing legend!", "You're a typing hero!", "You're a typing champion!", "You're a typing superstar!", "You're a typing sensation!", "You're a typing phenomenon!", "You're a typing marvel!", "You're a typing miracle!", "You're a typing wonder!", "You're a typing miracle!", "You're a typing marvel!", "You're a typing sensation!", "You're a typing superstar!", "You're a typing champion!", "You're a typing hero!", "You're a typing legend!", "You're a typing god!", "You're a typing genius!", "You're a typing prodigy!", "You're a typing master!", "You're a typing wizard!", "You're a typing machine!", "Keep it up!", "You're doing great!", "Great job!", "Great job!", "You're doing great!", "Keep it up!", "Woah!", "Amazing!", "Incredible!", "Unbelievable", "Unreal", "Radical!", "Awesome!", "Fantastic!", "Superb!", "Terrific!", "Stupendous!", "Phenomenal!", "Magnificent!", "Marvelous!", "Splendid!", "Spectacular!", "Stunning!", "Breathtaking!", "Astonishing!", "Mind-blowing!", "Mind-boggling!", "Mind-bending!", "Mind-blowing!", "Astonishing!", "Breathtaking!", "Stunning!", "Spectacular!", "Splendid!", "Marvelous!", "Magnificent!", "Phenomenal!", "Stupendous!", "Terrific!", "Superb!", "Fantastic!", "Awesome!", "Radical!", "Unreal", "Unbelievable", "Incredible!", "Amazing!", "Woah!", "Keep it up!", "You're doing great!", "Great job!"];
        return compliments[Math.floor(Math.random() * compliments.length)];
    }


    checkCombo(fromTimer = false) {
        // If called by the timer and the user hasn't inputted the correct combo length, end the game
        if (fromTimer || this.userInput.join('') !== this.combo.join('')) {
            this.gameOver();
            return;
        }

        // Compare userInput with combo and handle success or failure
        if (this.userInput.join('') === this.combo.join('')) {
            this.fisherman.play('catch');
            this.fisherman.playAfterDelay('fishing', 1300);
            this.score++;
            this.scoreText.setText('Score: ' + this.score);
            this.wpm = this.calculateWPM();
            this.wpmText.setText('WPM: ' + this.wpm);
            this.instructions.setText(this.generateCompliments());
            this.startComboSequence();
        } else if (!fromTimer) {
            // If the combo is wrong but not called by the timer, do not end the game immediately
            // Potentially handle incorrect input without ending the game here
            this.gameOver();
        } else {
            this.gameOver();
        }
    }

    create() {
        
        const typeSound = this.sound.add('type', { volume: .1 });

        // Initialize timer display
        this.timerText = this.add.text(480, 200, '', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ff0000',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        this.wpmText = this.add.text(480, 250, "WPM: 0", {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        this.scoreText = this.add.text(480, 300, this.score, {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        this.instructions = this.add.text(480, 650, "Press SHIFT to Start", {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        // add fishing sprite sheet
        this.anims.create({
            key: 'fishing',
            frames: this.anims.generateFrameNumbers('fishing', { start: 0, end: 18 }),
            frameRate: 20,
            repeat: -1
        });

        this.fisherman = this.add.sprite(480, 480, 'fishing').play('fishing').setScale(2).setDepth(-1);

        this.anims.create({
            key: 'catch',
            frames: this.anims.generateFrameNumbers('fishing', { start: 19, end: 45 }),
            frameRate: 20,
            repeat: -1
        });

        this.cameras.main.setBackgroundColor(0x00ff00);
        this.resetGameState()

        this.input.keyboard.on('keydown-SHIFT', () => {
            this.instructions.setText('Type the letters as fast as you can!');
            this.startComboSequence();
        });

        this.input.keyboard.on('keydown', (event) => {
            typeSound.play();
            const pressedKey = event.key.toUpperCase(); // Normalize to uppercase
            // check if the key is a letter or space
            if (pressedKey.length === 1) { // Check if it's a letter
                this.handleInput(pressedKey);
            }
        });




    }
}

console.log('FishChip Scene Loaded');

window.FishChipScene = FishChipScene;