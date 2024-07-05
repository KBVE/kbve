import { Scene } from 'phaser';

class ExtendedSprite extends Phaser.GameObjects.Sprite {
  textBubble?: Phaser.GameObjects.Container;
  messageBubble?: Phaser.GameObjects.Container;
}

export function createMessageBubble(scene: Scene, sprite: ExtendedSprite, text: string | string[], duration: number): Phaser.GameObjects.Container {
  const bubbleWidth = 200;
  const bubbleHeight = 60;
  const bubblePadding = 10;

  const bubble = scene.add.graphics();
  bubble.fillStyle(0xffffff, 1);
  bubble.fillRoundedRect(0, 0, bubbleWidth, bubbleHeight, 16);
  bubble.setDepth(99);

  const content = scene.add.text(100, 30, text, {
    fontFamily: 'Arial',
    fontSize: 16,
    color: '#000000',
  });
  content.setOrigin(0.5);
  content.setWordWrapWidth(bubbleWidth - bubblePadding * 2);
  content.setDepth(100);

  const container = scene.add.container(0, 0, [bubble, content]);
  container.setDepth(100);

  sprite.messageBubble = container;
  updateMessageBubblePosition(sprite);
  
  scene.time.addEvent({
    delay: duration,
    callback: () => {
      container.destroy();
      if (sprite.messageBubble === container) {
        sprite.messageBubble = undefined;
      }
    },
    callbackScope: scene
  });
  
  return container;
}

export function createTextBubble(scene: Scene, sprite: ExtendedSprite, text: string | string[]): Phaser.GameObjects.Container {
  const bubbleWidth = 200;
  const bubbleHeight = 60;
  const bubblePadding = 10;

  const bubble = scene.add.graphics();
  bubble.fillStyle(0xffffff, 1);
  bubble.fillRoundedRect(0, 0, bubbleWidth, bubbleHeight, 16);
  bubble.setDepth(99);

  const content = scene.add.text(100, 30, text, {
    fontFamily: 'Arial',
    fontSize: 16,
    color: '#000000',
  });
  content.setOrigin(0.5);
  content.setWordWrapWidth(bubbleWidth - bubblePadding * 2);
  content.setDepth(100);

  const container = scene.add.container(0, 0, [bubble, content]);
  container.setDepth(100);

  sprite.textBubble = container;
  updateTextBubblePosition(sprite);
  
  return container;
}

export function updateTextBubblePosition(sprite: ExtendedSprite) {
  const container = sprite.textBubble;
  if (container) {
    container.x = sprite.x;
    container.y = sprite.y - sprite.height - container.height / 2;
  }
}

export function updateMessageBubblePosition(sprite: ExtendedSprite) {
  const container = sprite.messageBubble;
  if (container) {
    container.x = sprite.x;
    container.y = sprite.y - sprite.height - container.height / 2;
  }
}