import * as Comlink from 'comlink';
import Dexie, { Table } from 'dexie';
import { getWardenInstance } from './wardenSingleton';
import { DataTome, Task, Warden, Minion } from './types';

class MinionImpl implements Minion {
  private static instance: MinionImpl;
  private db: Dexie;
  private myData: Table<DataTome, string>;
  private warden!: Comlink.Remote<Warden>;

  private constructor() {
    this.db = new Dexie(`MinionDatabase_${Math.random()}`);
    this.db.version(1).stores({
      myData: 'id, value',
    });
    this.myData = this.db.table('myData');
  }

  public static async getInstance(): Promise<MinionImpl> {
    if (!MinionImpl.instance) {
      MinionImpl.instance = new MinionImpl();
      MinionImpl.instance.warden = await getWardenInstance(); // Get the shared Warden instance
    }
    return MinionImpl.instance;
  }

  public async processTask(task: Task): Promise<void> {
    await this.addData(task.payload);

    // Call notifyTaskCompletion without passing `this` directly
    // Instead, pass a reference to the Minion's state or identifier
    const minionState = { id: 'minion1', status: 'busy' };
    await this.warden.notifyTaskCompletion(minionState, task.id);
  }

  public async addData(data: DataTome): Promise<void> {
    await this.myData.add(data);
  }

  public async getDataById(id: string): Promise<DataTome | undefined> {
    return await this.myData.get(id);
  }

  public async migrateDataToWarden(data: DataTome): Promise<void> {
    await this.warden.addDataToWarden(data);

    // Update the state in Warden
    const minionState = {
      id: 'minion1',
      status: 'data migrated',
      lastProcessedDataId: data.id,
    };
    await this.warden.updateMinionState(minionState);
  }
}

Comlink.expose(MinionImpl.getInstance());
