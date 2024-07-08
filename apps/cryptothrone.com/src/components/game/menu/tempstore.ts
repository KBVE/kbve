import { atom } from 'nanostores';
import {type NPCInteractionEventData, type PlayerStealEventData} from '@kbve/laser';
export const npcInteractionStore = atom<NPCInteractionEventData | null>(null);
export const playerStealDiceRoll = atom<PlayerStealEventData | null>(null);
export const diceRoll = atom<number | null>(null);