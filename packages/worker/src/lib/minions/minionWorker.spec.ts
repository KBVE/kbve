import '@vitest/web-worker'; // Import to enable Web Worker environment for this test suite
import * as Comlink from 'comlink';
import { Task, TaskStatus, Minion } from '../types'; // Import the Minion interface
import { describe, it, expect } from 'vitest';

describe('minionWorker', () => {
  it(
    'should expose MinionImpl via Comlink in a Web Worker',
    async () => {
      // Load the worker file as a URL
      const workerUrl = new URL('./minionWorker.ts', import.meta.url);

      // Create a Web Worker with the worker script
      const worker = new Worker(workerUrl, { type: 'module' });

      // Wrap the worker using Comlink
      const minionProxy = Comlink.wrap<Comlink.Remote<Minion>>(worker);

      // Check that the minion is properly created and can process a task
      expect(minionProxy).toBeDefined();

      // Create a mock task with the correct TaskStatus type
      const mockTask: Task = {
        id: 'task-1',
        payload: { id: 'data-1', value: 'test value' },
        status: TaskStatus.Queued,
      };

      // Call processTask on the minion instance
      await minionProxy.processTask(mockTask);

      // Terminate the worker after the test
      worker.terminate();
    },
    30000 // Set timeout to 30 seconds (30000 milliseconds)
  );
});
