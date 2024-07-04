import { Scene } from 'phaser';
import { Quadtree, type Bounds, type Point } from '@kbve/laser';

interface NPCConfig {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  walkingAnimationMapping: number;
  startPosition: { x: number; y: number };
  speed: number;
  textBubble?: Phaser.GameObjects.Container;
}

class NPCEngine {
  private scene: Scene;
  private gridEngine: any;
  private npcs: Map<string, NPCConfig>;
  private npcPool: Phaser.GameObjects.Sprite[];
  private quadtree: Quadtree;

  constructor(scene: Scene, gridEngine: any, bounds: Bounds) {
    this.scene = scene;
    this.gridEngine = gridEngine;
    this.npcs = new Map<string, NPCConfig>();
    this.npcPool = [];
    this.quadtree = new Quadtree(bounds);
  }

  addNPC(npcConfig: NPCConfig) {
    let sprite = this.npcPool.pop();
    if (!sprite) {
      sprite = this.scene.add.sprite(npcConfig.startPosition.x, npcConfig.startPosition.y, 'npc');
    } else {
      sprite.setPosition(npcConfig.startPosition.x, npcConfig.startPosition.y);
    }

    npcConfig.sprite = sprite;
    this.npcs.set(npcConfig.id, npcConfig);
    this.gridEngine.addCharacter({
      id: npcConfig.id,
      sprite: npcConfig.sprite,
      walkingAnimationMapping: npcConfig.walkingAnimationMapping,
      startPosition: npcConfig.startPosition,
      speed: npcConfig.speed,
    });

    this.quadtree.insert({
      name: npcConfig.id,
      bounds: {
        xMin: npcConfig.startPosition.x,
        xMax: npcConfig.startPosition.x + sprite.width,
        yMin: npcConfig.startPosition.y,
        yMax: npcConfig.startPosition.y + sprite.height,
      },
      action: () => {},
    });

    this.gridEngine.moveRandomly(npcConfig.id, 1500, npcConfig.speed);
  }

  removeNPC(npcId: string) {
    const npc = this.npcs.get(npcId);
    if (npc) {
      this.npcs.delete(npcId);
      this.npcPool.push(npc.sprite);
      npc.sprite.setActive(false).setVisible(false);
    }
  }

  createTextBubble(sprite: Phaser.GameObjects.Sprite, text: string | string[]): Phaser.GameObjects.Container {
    const bubbleWidth = 200;
    const bubbleHeight = 60;
    const bubblePadding = 10;

    const bubble = this.scene.add.graphics();
    bubble.fillStyle(0xffffff, 1);
    bubble.fillRoundedRect(0, 0, bubbleWidth, bubbleHeight, 16);
    bubble.setDepth(99);

    const content = this.scene.add.text(100, 30, text, {
      fontFamily: 'Arial',
      fontSize: 16,
      color: '#000000',
    });
    content.setOrigin(0.5);
    content.setWordWrapWidth(bubbleWidth - bubblePadding * 2);
    content.setDepth(100);

    const container = this.scene.add.container(0, 0, [bubble, content]);
    container.setDepth(100);

    this.updateTextBubblePosition(sprite, container);
    return container;
  }

  updateTextBubblePosition(sprite: Phaser.GameObjects.Sprite, container: Phaser.GameObjects.Container) {
    if (container) {
      container.x = sprite.x;
      container.y = sprite.y - sprite.height - container.height / 2;
    }
  }

  update() {
    const playerBounds = this.scene.cameras.main.worldView;
    const visibleNPCs = this.quadtree.queryRange({
      xMin: playerBounds.x,
      xMax: playerBounds.x + playerBounds.width,
      yMin: playerBounds.y,
      yMax: playerBounds.y + playerBounds.height
    });

    visibleNPCs.forEach(npc => {
      const npcConfig = this.npcs.get(npc.name);
      if (npcConfig) {
        this.gridEngine.updateCharacter(npcConfig.id); // Only update visible NPCs
        if (npcConfig.textBubble) {
          this.updateTextBubblePosition(npcConfig.sprite, npcConfig.textBubble);
        }
      }
    });
  }
}

export { NPCEngine, type NPCConfig };
