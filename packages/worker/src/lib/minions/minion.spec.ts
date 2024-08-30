import { createMinion } from './minion';
import * as Comlink from 'comlink';

import { TaskStatus, Task } from '../types';

describe('createMinion', () => {
  it('should create a proxied MinionImpl instance via a Web Worker', async () => {
    const id = 'test-minion';
    const minion = await createMinion(id);

    expect(minion).toBeDefined();
    expect(typeof minion).toBe('object');
    expect(minion.processTask).toBeDefined();
  });

  it('should be able to call processTask on the proxied MinionImpl instance', async () => {
    const id = 'test-minion';
    const minion = await createMinion(id);

    expect(minion.processTask).toBeDefined();
    expect(typeof minion.processTask).toBe('function');

    const mockTask: Task = {
      id: 'task-1',
      payload: { id: 'data-1', value: 'test value' },
      status: TaskStatus.Queued, 
    };

    await minion.processTask(mockTask);
  });
});
