// Types

export * from './types';

// Constants
export { default as KiloBaseState } from './lib/constants';

export { Quadtree } from './lib/quadtree';
export { EventEmitter, eventEmitterInstance } from './lib/eventhandler';


// Kilobase

export { kilobase, $profileStore, $usernameStore, $atlas } from './lib/kilobase/kilobase';

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
    getItemDetails,
	getUserSetting,
	setUserSetting,
} from './lib/localdb';

// Utils
export { default as ULIDFactory } from './lib/utils/ulid'; //  ULID
export { Debug } from './lib/utils/debug'; //  Debug
export { addLoader, removeLoader } from './lib/utils/loader'; //  Loader
export { ClientSideRegex } from './lib/regex';	// Regex

// Icons
export { default as CollapseIcon } from './lib/icon/CollapseIcon';
export { default as ExpandIcon } from './lib/icon/ExpandIcon';

// Map
export { MapDatabase, mapDatabase } from './lib/phaser/map/mapdatabase';

// MiniGames
export { default as MinigameDice } from './lib/minigame/dice/MinigameDice';

// Animations
export { default as TypewriterComponent } from './lib/animations/TypewriterComponent';

// Phaser
export { PlayerController } from './lib/phaser/player/playercontroller';

// NPC

// export { TooltipMenu } from './lib/phaser/npc/tooltipmenu';
// export { createMessageBubble, createTextBubble, updateTextBubblePosition, updateMessageBubblePosition } from './lib/phaser/npc/chatbubble';
export { NPCHandler, npcHandler }from './lib/phaser/npc/npchandler';
export { NPCDatabase, npcDatabase } from './lib/phaser/npc/npcdatabase';

// Monsters
export { getBirdNum, isBird, createBirdSprites, createShadowSprites, createBirdAnimation, createCroppedSprites } from './lib/phaser/monster/bird';

