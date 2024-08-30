import 'fake-indexeddb/auto';
import '@vitest/web-worker';
import { createMinion } from './minion';
import * as Comlink from 'comlink';
import { describe, it, expect } from 'vitest';
import { TaskStatus, Task, Minion } from '../types';

describe('createMinion', () => {
  it('should create a proxied MinionImpl instance via a Web Worker', async () => {
    const id = 'test-minion';
    const minion = await createMinion(id);

    // Verify that the minion proxy was created
    expect(minion).toBeDefined();
    expect(typeof minion).toBe('object');
    expect(minion.processTask).toBeDefined();
    expect(typeof minion.processTask).toBe('function');
  });

  it('should be able to call processTask on the proxied MinionImpl instance', async () => {
    const id = 'test-minion';
    const minion = await createMinion(id);

    expect(minion.processTask).toBeDefined();
    expect(typeof minion.processTask).toBe('function');

    // Define a mock task
    const mockTask: Task = {
      id: 'task-1',
      payload: { id: 'data-1', value: 'test value' },
      status: TaskStatus.Queued,
    };

    // Call processTask on the minion instance and await the result
    await minion.processTask(mockTask);

    // Optionally, you could verify that processTask worked by checking expected outcomes
  });
});