import eventEmitterInstance, { EventEmitter, EventData } from './eventhandler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { 
  OpenModalEventData, WASMEventData, GameEvent, CharacterEventData, PlayerEventData, 
  SceneTransitionEventData, TaskCompletionEventData, NPCInteractionEventData, 
  PlayerMoveEventData, NotificationEventData, PlayerStealEventData, PlayerCombatDamage, 
  PlayerRewardEvent, ItemActionEventData 
} from '../types';

describe('EventEmitter', () => {
  it('should register and call an event handler', () => {
    const handler = vi.fn();
    eventEmitterInstance.on('openModal', handler);
    
    const data: OpenModalEventData = { message: 'Test message' };
    eventEmitterInstance.emit('openModal', data);
    
    expect(handler).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(data);

    eventEmitterInstance.off('openModal', handler);
  });

  it('should not call an event handler after it is removed', () => {
    const handler = vi.fn();
    eventEmitterInstance.on('openModal', handler);
    eventEmitterInstance.off('openModal', handler);

    const data: OpenModalEventData = { message: 'Test message' };
    eventEmitterInstance.emit('openModal', data);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle multiple handlers for the same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    
    eventEmitterInstance.on('openModal', handler1);
    eventEmitterInstance.on('openModal', handler2);

    const data: OpenModalEventData = { message: 'Test message' };
    eventEmitterInstance.emit('openModal', data);

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();

    eventEmitterInstance.off('openModal', handler1);
    eventEmitterInstance.off('openModal', handler2);
  });

  it('should emit different events with their respective data', () => {
    const modalHandler = vi.fn();
    const wasmHandler = vi.fn();
    
    eventEmitterInstance.on('openModal', modalHandler);
    eventEmitterInstance.on('wasmEvent', wasmHandler);

    const modalData: OpenModalEventData = { message: 'Modal message' };
    const wasmData: WASMEventData = { result: { value: 42, description: 'WASM result' } };

    eventEmitterInstance.emit('openModal', modalData);
    eventEmitterInstance.emit('wasmEvent', wasmData);

    expect(modalHandler).toHaveBeenCalledWith(modalData);
    expect(wasmHandler).toHaveBeenCalledWith(wasmData);

    eventEmitterInstance.off('openModal', modalHandler);
    eventEmitterInstance.off('wasmEvent', wasmHandler);
  });

  it('should emit game events correctly', () => {
    const gameHandler = vi.fn();
    eventEmitterInstance.on('gameEvent', gameHandler);

    const gameData: GameEvent = { type: 'levelUp', payload: { level: 2 } };
    eventEmitterInstance.emit('gameEvent', gameData);

    expect(gameHandler).toHaveBeenCalledWith(gameData);

    eventEmitterInstance.off('gameEvent', gameHandler);
  });

  it('should emit character events correctly', () => {
    const charHandler = vi.fn();
    eventEmitterInstance.on('charEvent', charHandler);

    const charData: CharacterEventData = { message: 'Hello, world', character_name: 'Alice' };
    eventEmitterInstance.emit('charEvent', charData);

    expect(charHandler).toHaveBeenCalledWith(charData);

    eventEmitterInstance.off('charEvent', charHandler);
  });

  it('should emit player events correctly', () => {
    const playerHandler = vi.fn();
    eventEmitterInstance.on('playerEvent', playerHandler);

    const playerData: PlayerEventData = {
      stats: {
        username: 'TestUser',
        health: '100',
        mana: '50',
        energy: '75',
        maxHealth: '150',
        maxMana: '75',
        maxEnergy: '100',
        armour: '10',
        agility: '20',
        strength: '30',
        intelligence: '40',
        experience: '1000',
        reputation: '500',
        faith: '200'
      },
      inventory: {
        backpack: ['sword', 'shield'],
        equipment: {
          head: null,
          body: null,
          legs: null,
          feet: null,
          hands: null,
          weapon: null,
          shield: null,
          accessory: null
        }
      },
      state: {
        inCombat: false,
        isDead: false,
        isResting: false,
        activeBoosts: {}
      },
      account: 'player1'
    };
    eventEmitterInstance.emit('playerEvent', playerData);

    expect(playerHandler).toHaveBeenCalledWith(playerData);

    eventEmitterInstance.off('playerEvent', playerHandler);
  });

  it('should emit scene transition events correctly', () => {
    const sceneHandler = vi.fn();
    eventEmitterInstance.on('sceneTransition', sceneHandler);

    const sceneData: SceneTransitionEventData = { newSceneKey: 'forest' };
    eventEmitterInstance.emit('sceneTransition', sceneData);

    expect(sceneHandler).toHaveBeenCalledWith(sceneData);

    eventEmitterInstance.off('sceneTransition', sceneHandler);
  });

  it('should emit task completion events correctly', () => {
    const taskHandler = vi.fn();
    eventEmitterInstance.on('taskCompletion', taskHandler);

    const taskData: TaskCompletionEventData = { taskId: 'task-1', isComplete: true };
    eventEmitterInstance.emit('taskCompletion', taskData);

    expect(taskHandler).toHaveBeenCalledWith(taskData);

    eventEmitterInstance.off('taskCompletion', taskHandler);
  });

  it('should emit NPC interaction events correctly', () => {
    const npcHandler = vi.fn();
    eventEmitterInstance.on('npcInteraction', npcHandler);

    const npcData: NPCInteractionEventData = {
      npcId: 'npc-1', npcName: 'Goblin', actions: ['talk', 'fight'],
      coords: {
        x: 0,
        y: 0
      }
    };
    eventEmitterInstance.emit('npcInteraction', npcData);

    expect(npcHandler).toHaveBeenCalledWith(npcData);

    eventEmitterInstance.off('npcInteraction', npcHandler);
  });

  it('should emit player move events correctly', () => {
    const moveHandler = vi.fn();
    eventEmitterInstance.on('playerMove', moveHandler);

    const moveData: PlayerMoveEventData = { x: 10, y: 20 };
    eventEmitterInstance.emit('playerMove', moveData);

    expect(moveHandler).toHaveBeenCalledWith(moveData);

    eventEmitterInstance.off('playerMove', moveHandler);
  });

  it('should emit notification events correctly', () => {
    const notificationHandler = vi.fn();
    eventEmitterInstance.on('notification', notificationHandler);

    const notificationData: NotificationEventData = { title: 'Test', message: 'This is a test notification', notificationType: { type: 'info', color: 'blue', imgUrl: '/img/test.png' } };
    eventEmitterInstance.emit('notification', notificationData);

    expect(notificationHandler).toHaveBeenCalledWith(notificationData);

    eventEmitterInstance.off('notification', notificationHandler);
  });

  it('should emit player steal events correctly', () => {
    const stealHandler = vi.fn();
    eventEmitterInstance.on('playerSteal', stealHandler);

    const stealData: PlayerStealEventData = { npcId: 'npc-1', npcName: 'Goblin' };
    eventEmitterInstance.emit('playerSteal', stealData);

    expect(stealHandler).toHaveBeenCalledWith(stealData);

    eventEmitterInstance.off('playerSteal', stealHandler);
  });

  it('should emit player damage events correctly', () => {
    const damageHandler = vi.fn();
    eventEmitterInstance.on('playerDamage', damageHandler);

    const damageData: PlayerCombatDamage = { damage: '20' };
    eventEmitterInstance.emit('playerDamage', damageData);

    expect(damageHandler).toHaveBeenCalledWith(damageData);

    eventEmitterInstance.off('playerDamage', damageHandler);
  });

  it('should emit player reward events correctly', () => {
    const rewardHandler = vi.fn();
    eventEmitterInstance.on('playerReward', rewardHandler);

    const rewardData: PlayerRewardEvent = { message: 'You received an item!', item: { id: 'item-1', name: 'Sword', type: 'weapon' } };
    eventEmitterInstance.emit('playerReward', rewardData);

    expect(rewardHandler).toHaveBeenCalledWith(rewardData);

    eventEmitterInstance.off('playerReward', rewardHandler);
  });

  it('should emit item action events correctly', () => {
    const itemActionHandler = vi.fn();
    eventEmitterInstance.on('itemAction', itemActionHandler);

    const itemActionData: ItemActionEventData = { itemId: 'item-1', action: 'consume' };
    eventEmitterInstance.emit('itemAction', itemActionData);

    expect(itemActionHandler).toHaveBeenCalledWith(itemActionData);

    eventEmitterInstance.off('itemAction', itemActionHandler);
  });
});
