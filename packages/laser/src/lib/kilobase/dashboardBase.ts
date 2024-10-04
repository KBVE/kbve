// dashboardBase.ts
import { Kilobase } from './kilobase'; // Import the original Kilobase class
import { persistentAtom } from '@nanostores/persistent'; // Import persistent store utility from nanostores
import type { WritableAtom } from 'nanostores';

/**
 * Extending the existing Kilobase class to create a DashboardBase class.
 * This class will include additional functionality specific to managing the dashboard state.
 */
export class DashboardBase extends Kilobase {
  private itemPositionsStore: WritableAtom<Record<string, { id: string; container: string }[]>>;

  constructor() {
    super();

    // Define a persistent atom to hold item positions within this class
    this.itemPositionsStore = persistentAtom<Record<string, { id: string; container: string }[]>>(
      'dashboardItemPositions',
      {},
      {
        encode: JSON.stringify,
        decode: JSON.parse,
      }
    );
  }

  /**
   * Save item positions to the persistent store.
   * @param positions - Object containing positions of all items in each container.
   */
  saveItemPositions(positions: Record<string, { id: string; container: string }[]>) {
    this.itemPositionsStore.set(positions); // Save to the class-level persistent store
    console.log('Item positions saved to DashboardBase:', positions);
  }

  /**
   * Load item positions from the persistent store.
   * @returns The saved item positions, or an empty object if none exist.
   */
  loadItemPositions(): Record<string, { id: string; container: string }[]> {
    const positions = this.itemPositionsStore.get(); // Load from the class-level persistent store
    console.log('Item positions loaded from DashboardBase:', positions);
    return positions || {};
  }
}

// Export a singleton instance of the extended class for use throughout the application
export const dashboardBase = new DashboardBase();
