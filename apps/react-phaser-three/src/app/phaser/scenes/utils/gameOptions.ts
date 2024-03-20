// CONFIGURABLE GAME OPTIONS
// changing these values will affect gameplay
 
export const GameOptions = {
 
    // amount of steps to be created and recycled
    stepsAmount : 18,
  
    // staircase speed, in pixels per second
    staircaseSpeed : 80,
 
    // step size: x, y, z
    stepSize : new Phaser.Math.Vector3(400, 40, 160),
 
    // ball diameter, in pixels
    ballDiameter : 60,
 
    // ball starting step
    ballStartingStep : 2,
 
    // ball jump height, in pixels
    jumpHeight : 100,

    // ball speed, in pixels per second
    ballSpeed: 150,
}