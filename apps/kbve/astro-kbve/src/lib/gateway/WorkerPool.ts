// src/lib/gateway/WorkerPool.ts
// Worker pool manager with round-robin routing for DB operations

import type { WorkerMessage, WorkerResponse } from './types';

export interface WorkerPoolConfig {
	size: number;
	workerUrl: string | URL;
}

/**
 * WorkerPool: Manages a pool of workers with round-robin load balancing
 *
 * Features:
 * - Fixed-size pool (default: 3 workers)
 * - Round-robin routing for database operations
 * - Request/response tracking with UUIDs
 * - Automatic error handling and retries
 */
export class WorkerPool {
	private workers: Worker[] = [];
	private poolSize: number;
	private roundRobinIndex = 0;
	private pending = new Map<
		string,
		{ resolve: Function; reject: Function; workerId: number }
	>();
	private workerUrl: string | URL;
	private workerRetryCount = new Map<number, number>();
	private workerRetryTimers = new Map<
		number,
		ReturnType<typeof setTimeout>
	>();

	private readonly MAX_RETRY_ATTEMPTS = 3;
	private readonly BASE_RETRY_DELAY_MS = 1000; // Start with 1 second
	private readonly MAX_RETRY_DELAY_MS = 8000; // Cap at 8 seconds

	constructor(config: WorkerPoolConfig) {
		this.poolSize = config.size;
		this.workerUrl = config.workerUrl;
	}

	/**
	 * Initialize the worker pool
	 */
	async init(): Promise<void> {
		console.log(
			`[WorkerPool] Initializing pool with ${this.poolSize} workers`,
		);

		for (let i = 0; i < this.poolSize; i++) {
			try {
				const worker = new Worker(this.workerUrl, {
					type: 'module',
					name: `db-worker-${i}`,
				});

				worker.onmessage = (e: MessageEvent) =>
					this.handleMessage(e.data, i);
				worker.onerror = (err) => this.handleError(err, i);

				this.workers.push(worker);
				console.log(`[WorkerPool] Worker ${i} initialized`);
			} catch (err) {
				console.error(
					`[WorkerPool] Failed to create worker ${i}:`,
					err,
				);
				throw err;
			}
		}

		// Wait for all workers to be ready
		await Promise.all(
			this.workers.map((worker, i) =>
				this.sendToWorker(i, {
					id: crypto.randomUUID(),
					type: 'ping',
					payload: {},
				}),
			),
		);

		console.log('[WorkerPool] All workers ready');
	}

	/**
	 * Get next worker using round-robin
	 */
	private getNextWorker(): number {
		const workerId = this.roundRobinIndex;
		this.roundRobinIndex = (this.roundRobinIndex + 1) % this.poolSize;
		return workerId;
	}

	/**
	 * Send message to specific worker
	 */
	private sendToWorker<T>(
		workerId: number,
		message: WorkerMessage,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const worker = this.workers[workerId];
			if (!worker) {
				return reject(new Error(`Worker ${workerId} not available`));
			}

			this.pending.set(message.id, { resolve, reject, workerId });

			try {
				worker.postMessage(message);
			} catch (err) {
				this.pending.delete(message.id);
				reject(err);
			}
		});
	}

	/**
	 * Send message to next available worker (round-robin)
	 */
	send<T>(type: string, payload?: any): Promise<T> {
		const workerId = this.getNextWorker();
		const id = crypto.randomUUID();
		const message: WorkerMessage = { id, type, payload };

		return this.sendToWorker<T>(workerId, message);
	}

	/**
	 * Handle response from worker
	 */
	private handleMessage(response: WorkerResponse, workerId: number) {
		const { id, ok, data, error } = response;

		if (!id) {
			console.warn(
				`[WorkerPool] Worker ${workerId} sent message without ID:`,
				response,
			);
			return;
		}

		const pending = this.pending.get(id);
		if (!pending) {
			console.warn(
				`[WorkerPool] Received response for unknown request ${id}`,
			);
			return;
		}

		this.pending.delete(id);

		if (ok) {
			pending.resolve(data);
		} else {
			pending.reject(new Error(error || 'Worker request failed'));
		}
	}

	/**
	 * Handle worker error
	 */
	private handleError(error: ErrorEvent, workerId: number) {
		console.error(`[WorkerPool] Worker ${workerId} error:`, error);

		// Reject all pending requests for this worker
		const failedRequests: string[] = [];
		for (const [id, pending] of this.pending.entries()) {
			if (pending.workerId === workerId) {
				pending.reject(
					new Error(`Worker ${workerId} crashed: ${error.message}`),
				);
				failedRequests.push(id);
			}
		}

		failedRequests.forEach((id) => this.pending.delete(id));

		// Attempt to recreate the worker with backoff
		this.scheduleWorkerRecreation(workerId);
	}

	/**
	 * Schedule worker recreation with exponential backoff
	 */
	private scheduleWorkerRecreation(workerId: number) {
		const retryCount = this.workerRetryCount.get(workerId) || 0;

		if (retryCount >= this.MAX_RETRY_ATTEMPTS) {
			console.error(
				`[WorkerPool] Worker ${workerId} has failed ${retryCount} times. Giving up.`,
			);
			this.workerRetryCount.delete(workerId);
			return;
		}

		// Calculate exponential backoff delay: 1s, 2s, 4s
		const delay = Math.min(
			this.BASE_RETRY_DELAY_MS * Math.pow(2, retryCount),
			this.MAX_RETRY_DELAY_MS,
		);

		console.log(
			`[WorkerPool] Scheduling worker ${workerId} recreation in ${delay}ms (attempt ${retryCount + 1}/${this.MAX_RETRY_ATTEMPTS})`,
		);

		// Clear any existing timer
		const existingTimer = this.workerRetryTimers.get(workerId);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Schedule recreation
		const timer = setTimeout(() => {
			this.workerRetryTimers.delete(workerId);
			this.recreateWorker(workerId);
		}, delay);

		this.workerRetryTimers.set(workerId, timer);
		this.workerRetryCount.set(workerId, retryCount + 1);
	}

	/**
	 * Recreate a crashed worker
	 */
	private async recreateWorker(workerId: number) {
		const retryCount = this.workerRetryCount.get(workerId) || 0;
		console.log(
			`[WorkerPool] Attempting to recreate worker ${workerId} (attempt ${retryCount}/${this.MAX_RETRY_ATTEMPTS})`,
		);

		try {
			const worker = new Worker(this.workerUrl, {
				type: 'module',
				name: `db-worker-${workerId}`,
			});

			worker.onmessage = (e: MessageEvent) =>
				this.handleMessage(e.data, workerId);
			worker.onerror = (err) => this.handleError(err, workerId);

			this.workers[workerId] = worker;

			// Wait for worker to be ready
			await this.sendToWorker(workerId, {
				id: crypto.randomUUID(),
				type: 'ping',
				payload: {},
			});

			console.log(
				`[WorkerPool] Worker ${workerId} recreated successfully`,
			);

			// Reset retry count on success
			this.workerRetryCount.delete(workerId);
		} catch (err) {
			console.error(
				`[WorkerPool] Failed to recreate worker ${workerId}:`,
				err,
			);
			// The error handler will schedule another retry with backoff
		}
	}

	/**
	 * Terminate all workers
	 */
	terminate() {
		console.log('[WorkerPool] Terminating all workers');

		// Clear all retry timers
		this.workerRetryTimers.forEach((timer) => clearTimeout(timer));
		this.workerRetryTimers.clear();
		this.workerRetryCount.clear();

		this.workers.forEach((worker, i) => {
			try {
				worker.terminate();
			} catch (err) {
				console.error(
					`[WorkerPool] Error terminating worker ${i}:`,
					err,
				);
			}
		});

		this.workers = [];
		this.pending.clear();
	}

	/**
	 * Get pool statistics
	 */
	getStats() {
		return {
			size: this.poolSize,
			activeWorkers: this.workers.length,
			pendingRequests: this.pending.size,
			nextWorker: this.roundRobinIndex,
			workersWithRetries: Array.from(this.workerRetryCount.entries()).map(
				([id, count]) => ({ id, retryCount: count }),
			),
		};
	}
}
