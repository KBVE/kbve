export async function droid(opts?: {
  workerURLs?: Record<string, string>;
  workerRefs?: {
    canvasWorker?: Worker;
    dbWorker?: SharedWorker;
    wsWorker?: SharedWorker;
  };
}): Promise<{ initialized: boolean }> {
  console.log('[DROID]: droid<T>');

  const { main } = await import('./workers/main.js');

  await main({
    workerURLs: opts?.workerURLs,
    workerRefs: opts?.workerRefs,
  });

  console.log('[DROID]: droid<T> => await WorkerRefs + URLs');

  return { initialized: true };
}
