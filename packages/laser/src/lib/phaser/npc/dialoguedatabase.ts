import Dexie from 'dexie';
import axios from 'axios';
import { IDialogueObject } from '../../../types';

class DialogueDatabase extends Dexie {
    dialogues: Dexie.Table<IDialogueObject, string>;

    constructor() {
        super('DialogueDatabase');
        this.version(1).stores({
            dialogues: 'id'
        });
        this.dialogues = this.table('dialogues');
    }

    async addDialogue(dialogue: IDialogueObject) {
        await this.dialogues.put(dialogue);
    }

    async getDialogue(id: string): Promise<IDialogueObject | undefined> {
        return await this.dialogues.get(id);
    }

    async getAllDialogues(): Promise<IDialogueObject[]> {
        return await this.dialogues.toArray();
    }

    async exportDialogues(): Promise<string> {
        const dialogues = await this.getAllDialogues();
        return JSON.stringify(dialogues, null, 2);
    }

    async importDialogues(jsonData: string) {
        const dialogueArray: IDialogueObject[] = JSON.parse(jsonData);
        await this.dialogues.bulkPut(dialogueArray);
    }

    async fetchDialogueData(url: string): Promise<IDialogueObject | undefined> {
        try {
            const response = await axios.get<IDialogueObject>(url);
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch dialogue data from ${url}:`, error);
            return undefined;
        }
    }

    async initializeDatabase(baseURL = 'https://kbve.com') {
        await this.fetchDialogues(`${baseURL}/api/dialoguedb.json`);
    }

    async fetchDialogues(url: string): Promise<void> {
        try {
            const response = await axios.get(url);
            const dialogues = response.data.key;
            for (const key in dialogues) {
                const dialogueDetails = dialogues[key];
                const newDialogue: IDialogueObject = { ...dialogueDetails };
                await this.addDialogue(newDialogue);
            }
        } catch (error) {
            console.error(`Failed to fetch dialogues from ${url}:`, error);
        }
    }
}

// Export the class itself
export { DialogueDatabase };

// Export a singleton instance
export const dialogueDatabase = new DialogueDatabase();
