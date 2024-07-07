import { Scene } from 'phaser';

import { EventEmitter } from '../../eventhandler';

import { type NPCInteractionEventData } from '../../../types';

export class TooltipMenu extends Phaser.GameObjects.Container {
  background: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  buttons: Phaser.GameObjects.Text[];
  sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Scene, sprite: Phaser.GameObjects.Sprite, text: string, actions: { label: string, callback: () => void }[]) {
    const x = sprite.x;
    const y = sprite.y - sprite.height + 10; // Adjust this value to position it closer to the sprite
    super(scene, x, y);

    this.sprite = sprite;

    const bubbleWidth = 150;
    const bubbleHeight = 40 + actions.length * 20;
    const bubblePadding = 10;

    this.background = scene.add.rectangle(0, 0, bubbleWidth, bubbleHeight, 0x000000, 0.7);
    this.text = scene.add.text(0, -bubbleHeight / 2 + 10, text, { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
    this.buttons = actions.map((action, index) => {
      const button = scene.add.text(0, -bubbleHeight / 2 + 30 + index * 20, action.label, { fontSize: '12px', color: '#00ff00' }).setOrigin(0.5);
      button.setInteractive({ useHandCursor: true });
      button.on('pointerdown', action.callback);
      return button;
    });

    this.add(this.background);
    this.add(this.text);
    this.buttons.forEach(button => this.add(button));

    this.scene.add.existing(this);
  }

  updatePosition() {
    this.setPosition(this.sprite.x - 30, this.sprite.y - this.sprite.height - this.background.height / 2 + 100); // Adjust this value to position it closer to the sprite
  }

  static attachToSprite(scene: Scene, sprite: Phaser.GameObjects.Sprite, text: string, actions: { label: string, callback: () => void }[]) {
    sprite.setInteractive();
    sprite.on('pointerover', () => {
      const npcInteractionData: NPCInteractionEventData = {
        npcId: sprite.name,
        npcName: text,
        actions: actions.map(action => action.label),
      };
      EventEmitter.emit('npcInteraction', npcInteractionData);
      // Code to show the tooltip
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
