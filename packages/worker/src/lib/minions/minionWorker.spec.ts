import * as Comlink from 'comlink';
import { Task, TaskStatus } from '../types'; // Importing necessary types

describe('minionWorker', () => {
  it('should expose MinionImpl via Comlink in a Web Worker', async () => {
    // Load the worker file as a URL
    const workerUrl = new URL('./minionWorker.ts', import.meta.url);

    // Create a Web Worker with the worker script
    const worker = new Worker(workerUrl, { type: 'module' });

    // Wrap the worker using Comlink
    const MinionImpl = Comlink.wrap<any>(worker);

    // Create a new instance of MinionImpl using `new` on the proxy
    const minion = await new MinionImpl('worker-test-minion');

    // Check that the minion is properly created and can process a task
    expect(minion).toBeDefined();

    // Create a mock task with the correct TaskStatus type
    const mockTask: Task = {
      id: 'task-1',
      payload: { id: 'data-1', value: 'test value' },
      status: TaskStatus.Queued, // Use the TaskStatus enum
    };

    // Call processTask on the minion instance
    await minion.processTask(mockTask);

    // Terminate the worker after the test
    worker.terminate();
  });
});
