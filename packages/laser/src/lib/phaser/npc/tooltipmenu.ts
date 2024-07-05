import { Scene } from 'phaser';

export class TooltipMenu extends Phaser.GameObjects.Container {
  background: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  buttons: Phaser.GameObjects.Text[];
  sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Scene, sprite: Phaser.GameObjects.Sprite, text: string, actions: { label: string, callback: () => void }[]) {
    const x = sprite.x;
    const y = sprite.y - sprite.height - 20;
    super(scene, x, y);

    this.sprite = sprite;

    const bubbleWidth = 150;
    const bubbleHeight = 40 + actions.length * 20;
    const bubblePadding = 10;

    this.background = scene.add.rectangle(0, 0, bubbleWidth, bubbleHeight, 0x000000, 0.7);
    this.text = scene.add.text(0, -bubbleHeight / 2 + 10, text, { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
    this.buttons = actions.map((action, index) => {
      const button = scene.add.text(0, -bubbleHeight / 2 + 30 + index * 20, action.label, { fontSize: '12px', color: '#00ff00' }).setOrigin(0.5);
      button.setInteractive();
      button.on('pointerdown', action.callback);
      return button;
    });

    this.add(this.background);
    this.add(this.text);
    this.buttons.forEach(button => this.add(button));

    this.scene.add.existing(this);
  }

  updatePosition() {
    this.setPosition(this.sprite.x, this.sprite.y - this.sprite.height - 20);
  }

  static attachToSprite(scene: Scene, sprite: Phaser.GameObjects.Sprite, text: string, actions: { label: string, callback: () => void }[]) {
    sprite.setInteractive();
    sprite.on('pointerover', () => {
      if (!sprite.getData('tooltipMenu')) {
        const tooltipMenu = new TooltipMenu(scene, sprite, text, actions);
        sprite.setData('tooltipMenu', tooltipMenu);
      }
      const tooltipMenu = sprite.getData('tooltipMenu');
      tooltipMenu.setVisible(true);
      tooltipMenu.updatePosition();
    });
    sprite.on('pointerout', () => {
      const tooltipMenu = sprite.getData('tooltipMenu');
      if (tooltipMenu) {
        tooltipMenu.setVisible(false);
      }
    });
  }
  
  static updateAllTooltipPositions(scene: Scene) {
    scene.children.list.forEach(child => {
      if (child instanceof Phaser.GameObjects.Sprite) {
        const tooltipMenu = child.getData('tooltipMenu') as TooltipMenu;
        if (tooltipMenu) {
          tooltipMenu.updatePosition();
        }
      }
    });
  }
}
