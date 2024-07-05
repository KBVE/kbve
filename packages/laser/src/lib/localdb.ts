
// import { useStore } from '@nanostores/react';
import { persistentAtom } from '@nanostores/persistent';
import { EventEmitter } from './eventhandler';


export interface IPlayerStats {
    username: string;
    health: string;
    mana: string;
    energy: string;
    maxHealth: string;
    maxMana: string;
    maxEnergy: string;
    armour: string;
    agility: string;
    strength: string;
    intelligence: string;
    experience: string;
    reputation: string;
    faith: string;
}
const _IPlayerStats: IPlayerStats = {
    username: 'Guest',
    health: '1000',
    mana: '1000',
    energy: '1000',
    maxHealth: '1000',
    maxMana: '1000',
    maxEnergy: '1000',
    armour: '0',
    agility: '0',
    strength: '0',
    intelligence: '0',
    experience: '0',
    reputation: '0',
    faith: '0',
}

export interface IPlayerInventory {
    backpack: string[];
    equipment: {
        head: string | null;
        body: string | null;
        legs: string | null;
        feet: string | null;
        hands: string | null;
        weapon: string | null;
        shield: string | null;
        accessory: string | null;
    };
}

/** 
 * 
 *  IQuest - Slay 15 Goblins in the Castle and kill their leader.
 *     - IJournal 1 - Go to the Castle
 *          - ITask (1) -> (is X, Y Zone within Castle)
 *     - IJournal 2 - KIll 15 Goblins
 *          - ITask (15) -> Kill a Goblin
 *     - IJournal 3 - Slay The Goblin Leader
 *          - ITask (1) -> Kill Goblin Leader
 *     
 */



// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ITask<T = any> {
    id: string; // ULID
    name: string;
    description: string;
    isComplete: boolean;
    action: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IJournal<T = any> {
    id: string; // ULID
    title: string;
    tasks: ITask<T>[];
    isComplete: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IQuest<T = any> {
    id: string; // ULID
    title: string;
    description: string;
    journals: IJournal<T>[];
    isComplete: boolean;
    reward: string;
}


const _IQuest: IQuest = {
    id: '',
    title: '',
    description: '',
    journals: [],
    isComplete: false,
    reward: ''
}

const _IPlayerInventory: IPlayerInventory = {
    backpack: [],
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
}


export function completeTask<T>(quest: IQuest<T>, journalId: string, taskId: string): IQuest<T> {
    const updatedJournals = quest.journals.map(journal => {
        if (journal.id === journalId) {
            const updatedTasks = journal.tasks.map(task => 
                task.id === taskId ? { ...task, isComplete: true } : task
            );
            
            const isJournalComplete = updatedTasks.every(task => task.isComplete);
            
            // Emit task completion event
            EventEmitter.emit('taskCompletion', { taskId, isComplete: true });
            
            return { ...journal, tasks: updatedTasks, isComplete: isJournalComplete };
        }
        return journal;
    });
    
    const isQuestComplete = updatedJournals.every(journal => journal.isComplete);
    
    return { ...quest, journals: updatedJournals, isComplete: isQuestComplete };
}


export function addTask<T>(journal: IJournal<T>, task: ITask<T>): IJournal<T> {
    const updatedTasks = [...journal.tasks, task];
    return { ...journal, tasks: updatedTasks };
}

export function updateTask<T>(journal: IJournal<T>, taskId: string, updatedTask: Partial<ITask<T>>): IJournal<T> {
    const updatedTasks = journal.tasks.map(task =>
        task.id === taskId ? { ...task, ...updatedTask } : task
    );
    return { ...journal, tasks: updatedTasks };
}

export function removeTask<T>(journal: IJournal<T>, taskId: string): IJournal<T> {
    const updatedTasks = journal.tasks.filter(task => task.id !== taskId);
    return { ...journal, tasks: updatedTasks };
}

export function addJournal<T>(quest: IQuest<T>, journal: IJournal<T>): IQuest<T> {
    const updatedJournals = [...quest.journals, journal];
    return { ...quest, journals: updatedJournals };
}

export function updateJournal<T>(quest: IQuest<T>, journalId: string, updatedJournal: Partial<IJournal<T>>): IQuest<T> {
    const updatedJournals = quest.journals.map(journal =>
        journal.id === journalId ? { ...journal, ...updatedJournal } : journal
    );
    return { ...quest, journals: updatedJournals };
}

export function removeJournal<T>(quest: IQuest<T>, journalId: string): IQuest<T> {
    const updatedJournals = quest.journals.filter(journal => journal.id !== journalId);
    return { ...quest, journals: updatedJournals };
}

export function createPersistentAtom<T>(key: string, defaultValue: T) {
    return persistentAtom<T>(key, defaultValue, {
      encode(value) {
        return JSON.stringify(value);
      },
      decode(value) {
        try {
          return JSON.parse(value);
        } catch {
          return defaultValue;
        }
      }
    });
}

export const player = createPersistentAtom<IPlayerStats>('player', _IPlayerStats);
export const inventory = createPersistentAtom<IPlayerInventory>('inventory', _IPlayerInventory);
export const quest = createPersistentAtom<IQuest>('quest', _IQuest);
