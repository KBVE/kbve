import { GameOptions } from './gameOptions';
import * as THREE from 'three';
 
// class to define the step, extends THREE.Group
export class ThreeStep extends THREE.Group {

    public spike : THREE.Mesh;
    
    constructor(scene : Phaser.Scene, threeScene : THREE.Scene, stepNumber : number) {
        super();

        
         
        // build the step
        const stepGeometry : THREE.BoxGeometry = new THREE.BoxGeometry(GameOptions.stepSize.x, GameOptions.stepSize.y, GameOptions.stepSize.z);
        const stepMaterial : THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
            color : 0x09c4fe
        });
        const step : THREE.Mesh = new THREE.Mesh(stepGeometry, stepMaterial);
        step.receiveShadow = true;
 
        // build the spike
        const spikeGeometry = new THREE.ConeGeometry(25, 40, 32);
        const spikeMaterial = new THREE.MeshStandardMaterial({
            color: this.randomColor() 
            
        });


        this.spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
        this.spike.position.set(Phaser.Math.Between(-GameOptions.stepSize.x / 2 + 50, GameOptions.stepSize.x / 2 - 50), GameOptions.stepSize.y - 5, 0);
        this.spike.castShadow = true;
 
        // add step and spike to the group
        this.add(step, this.spike);
 
        // position the group properly
        this.position.set(scene.game.config.width as number / 2, stepNumber * GameOptions.stepSize.y, stepNumber * -GameOptions.stepSize.z);
 
        // add the group to the scene
        threeScene.add(this);
    }

    randomColor() : number {
        return Math.random() * 0xff0000;
    }

}