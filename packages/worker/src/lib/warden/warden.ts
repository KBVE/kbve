import * as Comlink from 'comlink';
import Dexie, { Table } from 'dexie';
import { Warden, Task, TaskStatus, MinionState, SharedData, Minion } from '../types';
import { generateULID } from '../ulid';
import { createMinion } from '../minions/minion';

export class WardenImpl implements Warden {
    private db: Dexie;
    private sharedData: Table<SharedData, string>;
    private minionStates: Table<MinionState, string>;
    private minions: { proxy: Comlink.Remote<Minion>, busy: boolean }[] = []; 
    private taskQueue: Task[] = [];
    private maxMinions: number;

    constructor(maxMinions = 4) {
        this.db = new Dexie('WardenDatabase');
        this.db.version(1).stores({
            sharedData: 'id, value',
            minionStates: 'id, status, lastProcessedDataId'
        });
        this.sharedData = this.db.table('sharedData');
        this.minionStates = this.db.table('minionStates');
        this.maxMinions = maxMinions;

        this.initializeMinionPool();
    }

    private async initializeMinionPool() {
        for (let i = 0; i < this.maxMinions; i++) {
            const id = `minion_${i + 1}`;
            const minionProxy = await createMinion(id);
            this.minions.push({ proxy: minionProxy, busy: false });
        }
    }


    public async assignTask(payload: any): Promise<string> {
        const taskId = generateULID();
        const task: Task = {
            id: taskId,
            payload,
            status: TaskStatus.Queued // Use TaskStatus enum
        };
        this.taskQueue.push(task);
        await this.assignNextTask(); // Assign tasks as they are added to the queue
        return taskId;
    }

    private async assignNextTask() {
        const nextTask = this.taskQueue.find(task => task.status === TaskStatus.Queued); // Use TaskStatus enum
        if (nextTask) {
            const minion = await this.getAvailableMinion();
            if (minion) {
                nextTask.status = TaskStatus.InProgress; // Use TaskStatus enum
                await minion['processTask'](nextTask);
            }
        }
    }
    
    public async getAvailableMinion(): Promise<Comlink.Remote<Minion> | null> {
        for (const minion of this.minions) {
            if (!minion.busy) {
                minion.busy = true;
                return minion.proxy; 
            }
        }
        return null;
    }

    public markMinionAsFree(minion: Comlink.Remote<Minion>, taskId: string) {
        for (const m of this.minions) {
            if (m.proxy === minion) {
                m.busy = false;
                break;
            }
        }
        this.updateTaskStatus(taskId, TaskStatus.Completed); 
        this.assignNextTask(); 
    }
    

    private updateTaskStatus(taskId: string, status: TaskStatus) {
        const task = this.taskQueue.find(task => task.id === taskId);
        if (task) {
            task.status = status;
        }
    }

    public async notifyTaskCompletion(minion: Comlink.Remote<Minion>, taskId: string) {
        this.markMinionAsFree(minion, taskId);
    }
    

    public getTaskStatus(taskId: string): TaskStatus {
        const task = this.taskQueue.find(task => task.id === taskId);
        return task ? task.status : TaskStatus.NotFound;
    }
    

    public async updateMinionState(state: MinionState): Promise<void> {
        await this.minionStates.put(state);
    }

    public async addDataToWarden(data: SharedData): Promise<void> {
        await this.sharedData.add(data);
    }
}

// Expose the Warden implementation to be used as a worker
Comlink.expose(WardenImpl);
