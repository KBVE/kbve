import 'fake-indexeddb/auto';
import { MinionImpl } from './minionImplementation';
import { DataTome, Task, TaskStatus } from '../types';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'; // Import from Vitest

describe('MinionImpl Integration Tests', () => {
  let minion: MinionImpl;
  const testId = 'minion-test';

  beforeEach(() => {
    // Create a new instance of MinionImpl with actual Dexie and QueryClient
    minion = new MinionImpl(testId);
  });

  afterEach(async () => {
    // Clean up the database after each test
    await Dexie.delete(`MinionDatabase_${testId}_*`);
  });

  it('should add data to the database', async () => {
    const data: DataTome = { id: 'data-1', value: 'test value' };

    await minion.addData(data);
    const storedData = await minion.getDataById(data.id);

    expect(storedData).toEqual(data);
  });

  it('should retrieve data by ID from the database', async () => {
    const data: DataTome = { id: 'data-2', value: 'another test value' };

    await minion.addData(data);
    const retrievedData = await minion.getDataById(data.id);

    expect(retrievedData).toEqual(data);
  });

  it('should process a task and store the result in TanStack Query', async () => {
    const task: Task = {
      id: 'task-3',
      payload: { id: 'data-3', value: 'test data' },
      status: TaskStatus.Queued,
    };

    await minion.processTask(task);

    const result = await minion.fetchQueryData(task.id);

    expect(result).toEqual({
      success: true,
      result: `Processed data: ${task.payload.value}`,
    });
  });

  it('should fetch query data by task ID', async () => {
    const taskId = 'task-4';
    const expectedResult = { success: true, result: 'Processed data: some data' };

    await minion['queryClient'].setQueryData(['taskResult', taskId], expectedResult);
    const result = await minion.fetchQueryData(taskId);

    expect(result).toEqual(expectedResult);
  });

  it('should migrate data to Warden', async () => {
    const data: DataTome = { id: 'data-5', value: 'migrate this' };

    const logMessages: any[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(
      (message?: any, ...optionalParams: any[]) => {
        logMessages.push({ message, optionalParams });
      }
    );
    
    await minion.migrateDataToWarden(data);

    expect(consoleSpy).toHaveBeenCalledWith(`Migrating data to Warden: ${data.id}`);

    consoleSpy.mockRestore();
  });
});
