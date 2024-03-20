import { GameOptions } from './gameOptions';
import * as THREE from 'three';
 
// class to define the ball, extends THREE.Mesh
export class ThreeBall extends THREE.Mesh {
 
    // amount of time the ball is in play, useful to determine its position 
    ballTime : number;
 
    // time needed for the ball to jump over next step
    jumpTime : number;
 
    // ball starting y position
    startY : number;
    
    constructor(scene : Phaser.Scene, threeScene : THREE.Scene) {
 
        // build the ball
        const SphereGeometry : THREE.SphereGeometry = new THREE.SphereGeometry(GameOptions.ballDiameter / 2, 32, 32);
        const sphereMaterial : THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
            color : 0x444444
        });
        super(SphereGeometry, sphereMaterial);
         
        // ball casts shadows
        this.castShadow = true;
 
        // ball is in time for zero milliseconds at the moment
        this.ballTime = 0;
 
        // jump time, in seconds, is determined by y step size divided by staircase speed
        this.jumpTime = GameOptions.stepSize.y / GameOptions.staircaseSpeed * 1000;
 
        // determine ball starting y position according to step size, ball diameter, and ball starting step
        this.startY = (GameOptions.ballStartingStep + 0.5) * GameOptions.stepSize.y + GameOptions.ballDiameter / 2
 
        // position the ball properly
        this.position.set(scene.game.config.width as number / 2, this.startY , GameOptions.ballStartingStep * -GameOptions.stepSize.z);
 
        // add the group to the scene
        threeScene.add(this);
    }
 
    // method to update ball position according to the time the ball is in play
    updateBallPosition(delta : number) : void {
 
        // determine ball time, being sure it will never be greater than the time required to jump on next step
        this.ballTime = (this.ballTime += delta) % this.jumpTime;
 
        // ratio is the amount of time passed divided by the time required to jump on next step
        let ratio : number = this.ballTime / this.jumpTime;
 
        // set ball y position using a sine curve
        this.position.setY(this.startY + Math.sin(ratio * Math.PI) * GameOptions.jumpHeight);
    }

    moveLeft(delta:number) : void {
        this.position.x -= delta / 1000 * GameOptions.ballSpeed;
    }

    moveRight(delta:number) : void {
        this.position.x += delta / 1000 * GameOptions.ballSpeed;
    }
}