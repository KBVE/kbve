export interface DataTome {
  id: string;
  value: string;
}

export enum TaskStatus {
  Queued = 'queued',
  InProgress = 'in-progress',
  Completed = 'completed',
  Failed = 'failed',
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
