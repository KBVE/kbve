export * from './lib/droid';
export * from './lib/types/bento';
export * from './lib/mod/mod-urls';
// export const workerURLs = {
//   canvasWorker: new URL('./lib/workers/canvas-worker.js', import.meta.url).toString(),
//   dbWorker: new URL('./lib/workers/db-worker.js', import.meta.url).toString(),
//   wsWorker: new URL('./lib/workers/ws-worker.js', import.meta.url).toString(),
// };
export const workerURLs = {
  canvasWorker: '/workers/canvas-worker.js',
  dbWorker: '/workers/db-worker.js',
  wsWorker: '/workers/ws-worker.js',
};