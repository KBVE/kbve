/** @jsxImportSource react */
// KanbanBase.ts
import { Kilobase } from '@kbve/laser'; // Import the original Kilobase class
import { persistentAtom } from '@nanostores/persistent'; // Import persistent store utility from nanostores
import type { WritableAtom } from 'nanostores';

/**
 * Extending the existing Kilobase class to create a Kanban class.
 * This class will include additional functionality specific to managing the dashboard state.
 */
export class KanbanBase extends Kilobase {
	private itemPositionsStore: WritableAtom<
		Record<string, { id: string; container: string }[]>
	>;

	private boardIdStore: WritableAtom<string | null>;

	constructor() {
		super();

		// Define a persistent atom to hold item positions within this class
		this.itemPositionsStore = persistentAtom<
			Record<string, { id: string; container: string }[]>
		>(
			'kanBanItemPositions',
			{},
			{
				encode: JSON.stringify,
				decode: JSON.parse,
			},
		);

		// Persistent store for the current board_id
		this.boardIdStore = persistentAtom<string | null>(
			'kanBanBoardId',
			null,
			{
				encode: JSON.stringify,
				decode: JSON.parse,
			},
		);
	}

	/**
	 * Save item positions to the persistent store.
	 * @param positions - Object containing positions of all items in each container.
	 */
	saveItemPositions(
		positions: Record<string, { id: string; container: string }[]>,
	) {
		this.itemPositionsStore.set(positions); // Save to the class-level persistent store
		console.log('Item positions saved to KanbanBase:', positions);
	}

	/**
	 * Load item positions from the persistent store.
	 * @returns The saved item positions, or an empty object if none exist.
	 */
	loadItemPositions(): Record<string, { id: string; container: string }[]> {
		const positions = this.itemPositionsStore.get(); // Load from the class-level persistent store
		console.log('Item positions loaded from KanbanBase:', positions);
		return positions || {};
	}

	/**
	 * Reset item positions for all containers.
	 * @param template - Object defining the structure of the containers to reset.
	 *                   Example: { "TODO": [], "IN-PROGRESS": [], "DONE": [] }
	 */

	resetItemPositions(
		template: Record<string, { id: string; container: string }[]>,
	) {
		const resetPositions = Object.keys(template).reduce(
			(acc, key) => {
				acc[key] = [];
				return acc;
			},
			{} as Record<string, { id: string; container: string }[]>,
		);

		this.itemPositionsStore.set(resetPositions); // Save the reset structure
		console.log('Item positions reset to:', resetPositions);
	}
	/**
	 * Load board data by board_id from the API.
	 * Saves the fetched data to local storage.
	 * @param boardId - The board_id to load data for.
	 * @returns Promise<Record<string, { id: string; container: string }[]> | null> - The board data if found, or null if not found.
	 */
	async loadBoardData(
		boardId: string,
	): Promise<Record<string, { id: string; container: string }[]> | null> {
		try {
			const response = await fetch(
				`https://kanban.kbve.com/api/get_board`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ board_id: boardId }),
				},
			);

			if (!response.ok) {
				console.error(
					`Failed to fetch board data for board ID: ${boardId}`,
				);
				return null;
			}

			const result = await response.json();

			if (
				result &&
				typeof result === 'object' &&
				'todo' in result &&
				'in_progress' in result &&
				'done' in result &&
				'unassigned' in result &&
				'metadata' in result &&
				'actions' in result
			) {
				// Save to local storage
				const formattedResult = {
					TODO: result.todo || [],
					'IN-PROGRESS': result.in_progress || [],
					DONE: result.done || [],
					UNASSIGNED: result.unassigned || [],
				};

				this.itemPositionsStore.set(formattedResult);
				console.log(
					`Loaded and saved board data for board ID: ${boardId}`,
				);

				// Optionally, you could handle metadata and actions separately if needed
				console.log('Metadata:', result.metadata);
				console.log('Actions:', result.actions);

				return formattedResult;
			}

			console.error(
				`Invalid board data structure for board ID: ${boardId}`,
			);
			return null;
		} catch (error) {
			console.error('Error loading board data:', error);
			return null;
		}
	}

	/**
	 * Save board data by board_id.
	 * @param boardId - The board_id to save data for.
	 * @param data - The Kanban data to save.
	 * @returns Promise<void>
	 */
	async saveBoardData(
		boardId: string,
		data: Record<string, { id: string; container: string }[]>,
	): Promise<void> {
		try {
			const currentPositions = this.itemPositionsStore.get();

			// Ensure data structure matches what the API expects

			const formattedData = {
				board_id: boardId,
				todo: currentPositions.TODO || [],
				in_progress: currentPositions['IN-PROGRESS'] || [],
				done: currentPositions.DONE || [],
			};
			console.log('Saving to API with data:', formattedData);

			// Save to the API
			const response = await fetch(
				`https://kanban.kbve.com/api/save_board`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(formattedData),
				},
			);

			if (!response.ok) {
				throw new Error('Failed to save board data to API');
			}

			console.log(`Saved board data to API for ${boardId}`);
		} catch (error) {
			console.error('Error saving board data:', error);
			throw error;
		}
	}

	/**
	 * Validate the board_id by attempting to load its data.
	 * @param boardId - The board_id to validate.
	 * @returns Promise<boolean> - True if the board_id is valid, false otherwise.
	 */
	async validateBoardId(boardId: string): Promise<boolean> {
		const boardData = await this.loadBoardData(boardId);
		return boardData !== null; // Valid if board data is found
	}
}

// Export a singleton instance of the extended class for use throughout the application
export const kanbanBase = new KanbanBase();
