import * as Comlink from 'comlink';
import Dexie, { Table } from 'dexie';
import { getWardenInstance } from './wardenSingleton';

import { DataTome, Task } from './types';

class Minion {
    private static instance: Minion;
    private db: Dexie;
    private myData: Table<DataTome, string>;
    private warden: Comlink.Remote<typeof import('./warden').default>;

    private constructor() {
        this.db = new Dexie(`MinionDatabase_${Math.random()}`);
        this.db.version(1).stores({
            myData: 'id, value',
        });
        this.myData = this.db.table('DataTome');
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

    public async addData(data: DataTome): Promise<void> {
        await this.myData.add(data);
    }

    public async getDataById(id: string): Promise<DataTome | undefined> {
        return await this.myData.get(id);
    }

    public async migrateDataToWarden(data: DataTome): Promise<void> {
        await this.warden.addDataToWarden(data);
        await this.warden.updateMinionState({ id: 'minion1', status: 'data migrated', lastProcessedDataId: data.id });
    }

}

Comlink.expose(Minion.getInstance());
