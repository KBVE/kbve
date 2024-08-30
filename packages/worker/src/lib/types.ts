import * as Comlink from 'comlink';

export interface DataTome {
  id: string;
  value: string;
}

export enum TaskStatus {
  Queued = 'queued',
  InProgress = 'in-progress',
  Completed = 'completed',
  Failed = 'failed',
  NotFound = 'not-found',
}

export interface Task {
  id: string;
  payload: DataTome;
  status: TaskStatus;
}

export interface MinionState {
  id: string;
  status: string;
  lastProcessedDataId?: string;
}

export interface SharedData {
  id: string;
  value: string;
}

export interface WardenState {
  minions: MinionState[];
  taskQueue: Task[];
  maxMinions: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface MinionConfig {
  id: string;
  maxTasks: number;
  memoryLimit: number;
}

export interface ErrorHandling {
  errorCode: string;
  errorMessage: string;
  timestamp: Date;
}


export interface Warden {
    assignTask(payload: any): Promise<string>;
    getAvailableMinion(): Promise<Comlink.Remote<Minion> | null>;
    markMinionAsFree(minion: Comlink.Remote<Minion>, taskId: string): void;
    notifyTaskCompletion(minion: Comlink.Remote<Minion>, taskId: string): void;
    getTaskStatus(taskId: string): TaskStatus;
    updateMinionState(state: MinionState): Promise<void>;
    addDataToWarden(data: DataTome): Promise<void>; 
}

export interface Minion {
    processTask(task: Task): Promise<void>;
    addData(data: DataTome): Promise<void>;
    getDataById(id: string): Promise<DataTome | undefined>;
    migrateDataToWarden(data: DataTome): Promise<void>;
}

export type MinionInstance = Comlink.Remote<Minion>;

export interface WardenConfig {
    maxMinions: number;
    taskQueueLimit?: number;
}

export interface TaskQueue {
    tasks: Task[];
    maxQueueSize?: number;
}

export interface MinionInitParams {
    dbName: string;
    maxDataEntries?: number;
}