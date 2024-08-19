// minion.ts
import * as Comlink from 'comlink';
import Dexie, { Table } from 'dexie';
import { getWardenInstance } from './wardenSingleton';

interface MyData {
    id: string;
    value: string;
}

interface Task {
    id: string;
    payload: MyData;
}

class Minion {
    private static instance: Minion;
    private db: Dexie;
    private myData: Table<MyData, string>;
    private warden: Comlink.Remote<typeof import('./warden').default>;

    private constructor() {
        this.db = new Dexie(`MinionDatabase_${Math.random()}`);
        this.db.version(1).stores({
            myData: 'id, value',
        });
        this.myData = this.db.table('myData');
    }

    public static async getInstance(): Promise<Minion> {
        if (!Minion.instance) {
            Minion.instance = new Minion();
            Minion.instance.warden = await getWardenInstance(); // Get the shared Warden instance
        }
        return Minion.instance;
    }

    public async processTask(task: Task): Promise<void> {
        // Process the task
        await this.addData(task.payload);

        // Notify the Warden that the task is complete
        await this.warden.notifyTaskCompletion(this, task.id);
    }

    public async addData(data: MyData): Promise<void> {
        await this.myData.add(data);
    }

    public async getDataById(id: string): Promise<MyData | undefined> {
        return await this.myData.get(id);
    }

    public async migrateDataToWarden(data: MyData): Promise<void> {
        await this.warden.addDataToWarden(data);
        await this.warden.updateMinionState({ id: 'minion1', status: 'data migrated', lastProcessedDataId: data.id });
    }

    // Add more methods as needed to handle Minion-specific logic
}

Comlink.expose(Minion.getInstance());
