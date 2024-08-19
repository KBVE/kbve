// warden.ts
import * as Comlink from 'comlink';
import Dexie, { Table } from 'dexie';
import { generateULID } from './ulid';  // Import the ULID generator
import Minion from './minion';

interface Task {
    id: string;
    payload: any;
    status: 'queued' | 'in-progress' | 'completed';
}

interface MinionState {
    id: string;
    status: string;
    lastProcessedDataId?: string;
}

interface SharedData {
    id: string;
    value: string;
}

class Warden {
    private static instance: Warden;
    private db: Dexie;
    private sharedData: Table<SharedData, string>;
    private minionStates: Table<MinionState, string>;
    private minions: { proxy: Comlink.Remote<Minion>, busy: boolean }[] = [];
    private taskQueue: Task[] = [];
    private maxMinions: number;

    private constructor(maxMinions: number = 4) {
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

    public static getInstance(maxMinions?: number): Warden {
        if (!Warden.instance) {
            Warden.instance = new Warden(maxMinions);
        }
        return Warden.instance;
    }

    private async initializeMinionPool() {
        for (let i = 0; i < this.maxMinions; i++) {
            const minionWorker = new Worker(new URL('./minion.ts', import.meta.url), { type: 'module' });
            const minionProxy = Comlink.wrap<Minion>(minionWorker);
            this.minions.push({ proxy: minionProxy, busy: false });
        }
    }

    public async assignTask(payload: any): Promise<string> {
        const taskId = generateULID(); // Generate a ULID for the task
        const task: Task = {
            id: taskId,
            payload,
            status: 'queued'
        };
        this.taskQueue.push(task);
        this.assignNextTask();
        return taskId;
    }

    private async assignNextTask() {
        if (this.taskQueue.length > 0) {
            const nextTask = this.taskQueue.find(task => task.status === 'queued');
            if (nextTask) {
                const minion = await this.getAvailableMinion();
                if (minion) {
                    nextTask.status = 'in-progress';
                    await minion.processTask(nextTask);
                }
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
        return null; // No available Minions
    }

    public markMinionAsFree(minion: Comlink.Remote<Minion>, taskId: string) {
        for (const m of this.minions) {
            if (m.proxy === minion) {
                m.busy = false;
                break;
            }
        }
        this.updateTaskStatus(taskId, 'completed');
        this.assignNextTask(); // Assign the next task from the queue
    }

    private updateTaskStatus(taskId: string, status: 'queued' | 'in-progress' | 'completed') {
        const task = this.taskQueue.find(task => task.id === taskId);
        if (task) {
            task.status = status;
        }
    }

    public async notifyTaskCompletion(minion: Comlink.Remote<Minion>, taskId: string) {
        this.markMinionAsFree(minion, taskId);
    }

    public getTaskStatus(taskId: string): 'queued' | 'in-progress' | 'completed' | 'not-found' {
        const task = this.taskQueue.find(task => task.id === taskId);
        return task ? task.status : 'not-found';
    }

    // Other methods for managing shared data, Minion states, etc.
}

Comlink.expose(Warden.getInstance());
export default Warden;
