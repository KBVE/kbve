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
}

// Export a singleton instance of the extended class for use throughout the application
export const kanbanBase = new KanbanBase();
