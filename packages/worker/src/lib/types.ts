
export interface DataTome {
    id: string;
    value: string;
}

export interface Task {
    id: string;
    payload: DataTome;
    status: 'queued' | 'in-progress' | 'completed';
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
