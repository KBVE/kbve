// Types

export * from './types';

// Constants
export { default as KiloBaseState } from './lib/constants';

export { Quadtree } from './lib/quadtree';
export { EventEmitter, eventEmitterInstance } from './lib/eventhandler';

// Explicitly exporting all named exports from localdb.ts
export {
	playerData,
	quest,
	itemStore,
	notificationsStore,
	itemDB,
	settings,
	minigameState,
    initialMinigameState,
    notificationType,
	completeTask,
	addTask,
	updateTask,
	removeTask,
	addJournal,
	updateJournal,
	removeJournal,
	reloadItemDB,
	queryItemDB,
	addItemToBackpack,
	createAndAddItemToBackpack,
	equipItem,
	unequipItem,
	removeItemFromBackpack,
	updatePlayerState,
	isPlayerInCombat,
	isPlayerDead,
	isPlayerResting,
	updatePlayerStats,
	setPlayerStat,
	decreasePlayerHealth,
	increasePlayerHealth,
	decreasePlayerMana,
	increasePlayerMana,
	decreasePlayerEnergy,
	increasePlayerEnergy,
	applyImmediateEffects,
	addStatBoost,
	removeStatBoost,
	getEffectiveStats,
	handleBoostExpiry,
	applyConsumableEffects,
	getActionEvents,
	updateMinigameState,
	setGameMode,
	setAction,
	setTextures,
	updateDiceValues,
	setRollingStatus,
    createPersistentAtom,
    addItemToStore,
    removeItemFromStore,
    getUserSetting,
    setUserSetting,
} from './lib/localdb';

// Utils
export { default as ULIDFactory } from './lib/utils/ulid'; // ULID
export * from './lib/utils/debug'; // Debug
export * from './lib/utils/loader'; // Loader

// Icons
export { default as CollapseIcon } from './lib/icon/CollapseIcon';
export { default as ExpandIcon } from './lib/icon/ExpandIcon';

// Map
export * from './lib/phaser/map/mapdatabase';

// MiniGames
export { default as MinigameDice } from './lib/minigame/dice/MinigameDice';

// Animations
export { default as TypewriterComponent } from './lib/animations/TypewriterComponent';

// Phaser
export * from './lib/phaser/player/playercontroller';

// NPC
export * from './lib/phaser/npc/tooltipmenu';
export * from './lib/phaser/npc/chatbubble';
export * from './lib/phaser/npc/npchandler';
export * from './lib/phaser/npc/npcdatabase';

// Monsters
export * from './lib/phaser/monster/bird';
