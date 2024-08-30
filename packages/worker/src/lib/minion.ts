import * as Comlink from 'comlink';
import Dexie, { Table } from 'dexie';
import { DataTome, Task, Minion, MinionState } from './types';

class MinionImpl implements Minion {
  private db: Dexie;
  private myData: Table<DataTome, string>;

  constructor(private id: string) {
    this.db = new Dexie(`MinionDatabase_${id}_${Math.random()}`);
    this.db.version(1).stores({
      myData: 'id, value',
    });
    this.myData = this.db.table('myData');
  }

  public async processTask(task: Task): Promise<void> {
    await this.addData(task.payload);

    // Task processing logic here...
  }

  public async addData(data: DataTome): Promise<void> {
    await this.myData.add(data);
  }

  public async getDataById(id: string): Promise<DataTome | undefined> {
    return await this.myData.get(id);
  }

  public async migrateDataToWarden(data: DataTome): Promise<void> {
    // Logic to migrate data to Warden
  }
}

// Expose the MinionImpl class as a private helper function to create instances
export function createMinion(id: string) {
  return Comlink.proxy(new MinionImpl(id));
}
