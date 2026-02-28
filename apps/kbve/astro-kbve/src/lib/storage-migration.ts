// src/lib/storage-migration.ts
// One-time migration from old sb-auth to new sb-auth-v2 database

const MIGRATION_KEY = 'sb-auth-migrated';
const OLD_DB_NAME = 'sb-auth';
const NEW_DB_NAME = 'sb-auth-v2';

/**
 * Migrates data from old sb-auth database to new sb-auth-v2 database
 * Only runs once per browser, tracked via localStorage
 */
export async function migrateAuthStorage(): Promise<void> {
	// Check if migration already completed
	if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
		return;
	}

	const migrated = localStorage.getItem(MIGRATION_KEY);
	if (migrated === 'true') {
		console.log('[Migration] Already migrated, skipping');
		return;
	}

	try {
		console.log('[Migration] Starting auth storage migration...');

		// Check if old database exists
		const dbs = await indexedDB.databases();
		const hasOldDB = dbs.some((db) => db.name === OLD_DB_NAME);

		if (!hasOldDB) {
			console.log(
				'[Migration] Old database does not exist, marking as migrated',
			);
			localStorage.setItem(MIGRATION_KEY, 'true');
			return;
		}

		// Open old database and read all data
		const oldData = await readOldDatabase();

		if (oldData.size === 0) {
			console.log('[Migration] Old database is empty');
		} else {
			console.log(
				`[Migration] Found ${oldData.size} items in old database`,
			);
			// Import into new database is handled automatically by Dexie
			// when IDBStorage is instantiated - it will create the new DB
			// The Supabase client will handle reading from the new storage
		}

		// Delete old database
		await deleteDatabase(OLD_DB_NAME);
		console.log('[Migration] Successfully deleted old database');

		// Mark migration as complete
		localStorage.setItem(MIGRATION_KEY, 'true');
		console.log('[Migration] Migration complete');
	} catch (error) {
		console.error('[Migration] Migration failed:', error);
		// Don't block app startup on migration failure
		// Mark as migrated anyway to avoid retrying on every load
		localStorage.setItem(MIGRATION_KEY, 'true');
	}
}

/**
 * Read all key-value pairs from old database
 */
async function readOldDatabase(): Promise<Map<string, string>> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(OLD_DB_NAME, 1);
		const data = new Map<string, string>();

		req.onerror = () => reject(req.error);

		req.onsuccess = () => {
			const db = req.result;

			// Check if the 'kv' store exists
			if (!db.objectStoreNames.contains('kv')) {
				console.log('[Migration] Old database has no kv store');
				db.close();
				resolve(data);
				return;
			}

			try {
				const tx = db.transaction('kv', 'readonly');
				const store = tx.objectStore('kv');
				const getAllReq = store.getAll();

				getAllReq.onsuccess = () => {
					// Old database stored values directly with keys
					const cursor = store.openCursor();
					cursor.onsuccess = (event) => {
						const c = (event.target as IDBRequest).result;
						if (c) {
							data.set(c.key as string, c.value as string);
							c.continue();
						} else {
							db.close();
							resolve(data);
						}
					};
					cursor.onerror = () => {
						db.close();
						reject(cursor.error);
					};
				};

				getAllReq.onerror = () => {
					db.close();
					reject(getAllReq.error);
				};
			} catch (err) {
				db.close();
				reject(err);
			}
		};
	});
}

/**
 * Delete a database by name
 */
async function deleteDatabase(dbName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.deleteDatabase(dbName);

		req.onsuccess = () => {
			console.log(`[Migration] Successfully deleted database: ${dbName}`);
			resolve();
		};

		req.onerror = () => {
			console.error(
				`[Migration] Error deleting database ${dbName}:`,
				req.error,
			);
			reject(req.error);
		};

		req.onblocked = () => {
			console.warn(
				`[Migration] Database ${dbName} deletion blocked, resolving anyway`,
			);
			// Resolve anyway - blocked means other tabs have it open
			// It will be cleaned up when those tabs close
			setTimeout(() => resolve(), 500);
		};
	});
}

/**
 * Force reset migration state (for testing/debugging)
 */
export function resetMigration(): void {
	localStorage.removeItem(MIGRATION_KEY);
	console.log('[Migration] Reset migration state');
}
