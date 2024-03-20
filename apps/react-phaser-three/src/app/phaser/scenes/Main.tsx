import { Scene3D } from '@enable3d/phaser-extension'



export class Main extends Scene3D {

  private isTouchDevice: boolean
  constructor() {
    super({ key: 'Main' })
    this.isTouchDevice = false
  }

  init() {
    this.accessThirdDimension()
  }

  create() {

    // check if the device is touch (mobile or tablet) so we know if it's a computer or a mobile type device
    this.isTouchDevice = this.sys.game.device.input.touch

    // creates a nice scene
    this.third.warpSpeed()

    // adds a box
    this.third.add.box({ x: 1, y: 2, z: 0 })

    // adds a box with physics
    this.third.physics.add.box({ x: -1, y: 2, z: 0 })

    // throws some random object on the scene
    this.third.haveSomeFun()
  }

  update() {
    // skip
  }


}