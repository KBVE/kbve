import Phaser from "phaser";
import * as THREE from 'three';
import React, { useEffect, useState } from "react"; // This line seems to be from your React component, ensure it's used correctly in context

import { getScore,setScore } from "./utils/score";

import { GameOptions } from './utils/gameOptions';
import { ThreeStep } from './utils/threeStep';
import { ThreeBall } from './utils/threeBall';

export class Main extends Phaser.Scene {
    steps : ThreeStep[];
    ball : ThreeBall | null;
    leftKey : Phaser.Input.Keyboard.Key | null;
    rightKey : Phaser.Input.Keyboard.Key | null;
    score: number;
    gameOver: boolean;
    enterKey: Phaser.Input.Keyboard.Key | null;
    scoreText: Phaser.GameObjects.Text | null;
    bestScore: number;

    constructor() {
        super({ key: 'Main' });
        this.steps = [];
        this.ball = null;
        this.leftKey = null;
        this.rightKey = null;
        this.score = 0;
        this.gameOver = false;
        this.enterKey = null;
        this.scoreText = null;
        this.bestScore = getScore();
    }

    create() {
        const threeScene : THREE.Scene = this.create3DWorld();
        
        for (let i = 0; i < GameOptions.stepsAmount; i ++) {
            this.steps.push(new ThreeStep(this, threeScene, i+5));
        }    
 
        this.ball = new ThreeBall(this, threeScene)

        this.leftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
        this.rightKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

        this.scoreText = this.add.text(10, 10, `Score: ${this.score}`, { font: '16px Courier', fill: '#00ff00' });
        
        this.time.addEvent({
            delay: 1000,
            callback: () => {
                if (!this.gameOver) {
                    this.score += 1;
                }
                if (this.scoreText) this.scoreText.setText(`Score: ${this.score}`);

                
            },
            loop: true
        });
    }
    
    create3DWorld() : THREE.Scene {
 
        const width : number = this.game.config.width as number;
        const height : number = this.game.config.height as number;
 
        const threeScene : THREE.Scene = new THREE.Scene();
 
        const renderer : THREE.WebGLRenderer = new THREE.WebGLRenderer({
            canvas: this.sys.game.canvas,
            context: this.sys.game.context as WebGLRenderingContext,
            antialias: true
        });
        renderer.autoClear = false;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
 
        const camera  = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
        camera.position.set(width / 2, 720, 640);
        camera.lookAt(width / 2 , 560, 320);
 
        const ambientLight : THREE.AmbientLight = new THREE.AmbientLight(0xffffff, 1);
        threeScene.add(ambientLight);
         
        const directionalLight : THREE.DirectionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.castShadow = true;
        directionalLight.position.set(270, 200, 0);
        directionalLight.target.position.set(270, 100, -1000);
        threeScene.add(directionalLight);
        threeScene.add(directionalLight.target)
        
        const spotLight : THREE.SpotLight = new THREE.SpotLight(0xffffff, 0.2, 0, 0.4, 0.5, 0.1);
        spotLight.position.set(270, 1000, 0);
        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = 1024;
        spotLight.shadow.mapSize.height = 1024;
        spotLight.shadow.camera.near = 1;
        spotLight.shadow.camera.far = 10000;
        spotLight.shadow.camera.fov = 80;
        spotLight.target.position.set(270, 0, -320);
        threeScene.add(spotLight);
        threeScene.add(spotLight.target);
 
        const fog : THREE.Fog = new THREE.Fog(0x011025, 500, 2000);
        threeScene.fog = fog;
 
        const view : Phaser.GameObjects.Extern = this.add.extern();
         
        view.render = () => {
            renderer.state.reset();
            renderer.render(threeScene, camera);
        };        
        return threeScene;
    }

      update(time : number, deltaTime : number) : void {

        if (this.gameOver) {
            if (this.enterKey?.isDown) {
                this.scene.restart();
            }
            return;
        }
 
        if (!this.ball) return;
        this.ball.updateBallPosition(deltaTime);

        this.steps.forEach((step : ThreeStep) => {
 
            step.position.y -= deltaTime / 1000 * GameOptions.staircaseSpeed;
            step.position.z += deltaTime / 1000 * GameOptions.staircaseSpeed * GameOptions.stepSize.z / GameOptions.stepSize.y;
            
            if (step.position.y < - 40) {
 
                step.position.y += GameOptions.stepsAmount * GameOptions.stepSize.y;
                step.position.z -= GameOptions.stepsAmount * GameOptions.stepSize.z;
 
                if (step.spike) {
                    step.spike.position.x = Phaser.Math.Between(-150, 150)
                }
            }
        })

        if (this.leftKey?.isDown) {
            if (this.ball && this.ball.position.x > this.game.config.width / 2 - GameOptions.stepSize.x / 2 + GameOptions.ballDiameter / 2) {
                this.ball.moveLeft(deltaTime);
            }
        }
        if (this.rightKey?.isDown) {
            if (this.ball && this.ball.position.x < this.game.config.width / 2 + GameOptions.stepSize.x / 2 - GameOptions.ballDiameter / 2) {
                this.ball.moveRight(deltaTime);
            }
        }
        

        this.checkCollisions();

    }

    checkCollisions(): void {
        if (!this.ball) return;
        const ballBox = new THREE.Box3().setFromObject(this.ball);
    
        this.steps.forEach((step: ThreeStep) => {
            if (!step.spike) return;
            const spikeBox = new THREE.Box3().setFromObject(step.spike);
            const scaleDownFactor = 0.1;
            const size = new THREE.Vector3();
            spikeBox.getSize(size);
            size.multiplyScalar(scaleDownFactor);
            spikeBox.min.add(size.clone().multiplyScalar(0.5));
            spikeBox.max.sub(size.clone().multiplyScalar(0.5))
    
            if (ballBox.intersectsBox(spikeBox)) {
                this.handleCollision();
            }
        });
    }

    handleCollision() : void {
        console.log('collision');

        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            setScore(this.bestScore);
        }
        this.gameOver = true;
        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.add.text(10, 30, `Best Score: ${this.bestScore}`, { font: '16px Courier', fill: '#00ff00' });

    }
        
}