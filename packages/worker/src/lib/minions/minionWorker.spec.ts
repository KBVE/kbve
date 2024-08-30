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
      const workerProxy = Comlink.wrap<{
        createMinion: (id: string) => Promise<Comlink.Remote<Minion>>;
      }>(worker);

      // Use the factory function to create a MinionImpl instance
      const minion = await workerProxy.createMinion('worker-test-minion');

      // Check that the minion is properly created and can process a task
      expect(minion).toBeDefined();

      // Create a mock task with the correct TaskStatus type
      const mockTask: Task = {
        id: 'task-1',
        payload: { id: 'data-1', value: 'test value' },
        status: TaskStatus.Queued,
      };

      // Call processTask on the minion instance
      await minion.processTask(mockTask);

      // Terminate the worker after the test
      worker.terminate();
    },
    10000 // Set timeout to 10 seconds (10000 milliseconds)
  );
});
