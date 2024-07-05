import { completeTask, addTask, updateTask, removeTask, addJournal, updateJournal, removeJournal, createPersistentAtom } from './localdb';
import { EventEmitter } from './eventhandler';
import type { IQuest, IJournal, ITask, IPlayerData, IPlayerStats, IPlayerInventory } from './localdb';

describe('localdb.ts', () => {
    let quest: IQuest;
    let journal: IJournal;
    let task: ITask;
    
    beforeEach(() => {
        task = {
            id: 'task-1',
            name: 'Sample Task',
            description: 'This is a sample task',
            isComplete: false,
            action: {}
        };

        journal = {
            id: 'journal-1',
            title: 'Sample Journal',
            tasks: [task],
            isComplete: false
        };

        quest = {
            id: 'quest-1',
            title: 'Sample Quest',
            description: 'This is a sample quest',
            journals: [journal],
            isComplete: false,
            reward: 'Sample Reward'
        };
    });

    it('should complete a task', () => {
        const updatedQuest = completeTask(quest, 'journal-1', 'task-1');
        expect(updatedQuest.journals[0].tasks[0].isComplete).toBe(true);
    });

    it('should add a task to a journal', () => {
        const newTask: ITask = {
            id: 'task-2',
            name: 'New Task',
            description: 'This is a new task',
            isComplete: false,
            action: {}
        };
        const updatedJournal = addTask(journal, newTask);
        expect(updatedJournal.tasks.length).toBe(2);
        expect(updatedJournal.tasks[1]).toEqual(newTask);
    });

    it('should update a task in a journal', () => {
        const updatedTask = { name: 'Updated Task' };
        const updatedJournal = updateTask(journal, 'task-1', updatedTask);
        expect(updatedJournal.tasks[0].name).toBe('Updated Task');
    });

    it('should remove a task from a journal', () => {
        const updatedJournal = removeTask(journal, 'task-1');
        expect(updatedJournal.tasks.length).toBe(0);
    });

    it('should add a journal to a quest', () => {
        const newJournal: IJournal = {
            id: 'journal-2',
            title: 'New Journal',
            tasks: [],
            isComplete: false
        };
        const updatedQuest = addJournal(quest, newJournal);
        expect(updatedQuest.journals.length).toBe(2);
        expect(updatedQuest.journals[1]).toEqual(newJournal);
    });

    it('should update a journal in a quest', () => {
        const updatedJournal = { title: 'Updated Journal' };
        const updatedQuest = updateJournal(quest, 'journal-1', updatedJournal);
        expect(updatedQuest.journals[0].title).toBe('Updated Journal');
    });

    it('should remove a journal from a quest', () => {
        const updatedQuest = removeJournal(quest, 'journal-1');
        expect(updatedQuest.journals.length).toBe(0);
    });

    it('should create a persistent atom for player data and handle JSON parsing', () => {
        const playerData: IPlayerData = {
            stats: {
                username: 'TestUser',
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
                faith: '0'
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
            }
        };
        const playerAtom = createPersistentAtom<IPlayerData>('testPlayerData', playerData);
        expect(playerAtom.get()).toEqual(playerData);
        
        playerAtom.set({ 
            ...playerData, 
            stats: { ...playerData.stats, username: 'UpdatedUser' } 
        });
        expect(playerAtom.get().stats.username).toBe('UpdatedUser');
    });
});
