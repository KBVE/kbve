import eventEmitterInstance, { EventEmitter, EventData, OpenModalEventData, WASMEventData, GameEvent, CharacterEventData, PlayerEventData, SceneTransitionEventData, TaskCompletionEventData } from './eventhandler';
import { IPlayerStats, IPlayerInventory } from './localdb';

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
});
