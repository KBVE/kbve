import Dexie, { Table } from 'dexie';
import { QueryClient, QueryObserver } from '@tanstack/query-core';
import { DataTome, Task, Minion } from '../types';

export class MinionImpl implements Minion {
  private db: Dexie;
  private myData: Table<DataTome, string>;
  private queryClient: QueryClient;

  constructor(private id: string) {
    this.db = new Dexie(`MinionDatabase_${id}_${Math.random()}`);
    this.db.version(1).stores({
      myData: 'id, value',
    });
    this.myData = this.db.table('myData');
    this.queryClient = new QueryClient();

    // Optionally observe any query for reactivity
    const observer = new QueryObserver(this.queryClient, { queryKey: ['minionData'] });
    observer.subscribe((result) => {
      console.log('Query result:', result);
    });
  }

  public async processTask(task: Task): Promise<void> {
    await this.addData(task.payload);

    // Simulate processing the task
    console.log(`Processing task ${task.id} with data: ${task.payload.value}`);

    // After processing, store the result in TanStack Query
    this.queryClient.setQueryData(['taskResult', task.id], {
      success: true,
      result: `Processed data: ${task.payload.value}`,
    });

    // Migrate processed data to Warden if needed
    await this.migrateDataToWarden(task.payload);
  }

  public async addData(data: DataTome): Promise<void> {
    await this.myData.add(data);
    console.log(`Data added: ${data.id}`);
  }

  public async getDataById(id: string): Promise<DataTome | undefined> {
    const data = await this.myData.get(id);
    console.log(`Retrieved data by ID ${id}: ${data?.value}`);
    return data;
  }

  public async migrateDataToWarden(data: DataTome): Promise<void> {
    // Example logic to migrate data to Warden
    console.log(`Migrating data to Warden: ${data.id}`);
    // Implement the actual migration logic
  }

  public async fetchQueryData(taskId: string): Promise<any> {
    // Fetch the result from the query client, for testing purposes
    return this.queryClient.getQueryData(['taskResult', taskId]);
  }
}
