import Dexie, { Table } from 'dexie';
import { QueryClient, QueryObserver, QueryClientConfig } from '@tanstack/query-core';
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

    const queryClientConfig: QueryClientConfig = {
      defaultOptions: {
        queries: {
          queryFn: async ({ queryKey }) => {
            const [key, taskId] = queryKey;
            if (key === 'taskResult') {
              return this.fetchQueryData(taskId as string);
            }
            else if (key === 'minionData') {
              // Handle the 'minionData' query key appropriately or return a mock value
              return { data: `Mock data for ${key}` };
            }
            throw new Error(`Unknown query key: ${key}`);
          },
        },
      },
    };

    this.queryClient = new QueryClient(queryClientConfig);

    const observer = new QueryObserver(this.queryClient, { queryKey: ['minionData'] });
    observer.subscribe((result) => {
      console.log('Query result:', result);
    });
  }

  public async processTask(task: Task): Promise<void> {
    await this.addData(task.payload);

    console.log(`Processing task ${task.id} with data: ${task.payload.value}`);

    this.queryClient.setQueryData(['taskResult', task.id], {
      success: true,
      result: `Processed data: ${task.payload.value}`,
    });

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
    console.log(`Migrating data to Warden: ${data.id}`);
  }

  public async fetchQueryData(taskId: string): Promise<any> {
    return this.queryClient.getQueryData(['taskResult', taskId]);
  }
}
