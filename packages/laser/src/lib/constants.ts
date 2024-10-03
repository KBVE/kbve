// constants.ts

import type { IKiloBase } from '../types';

// Define the default constants based on the IKiloBase interface
const defaultKiloBaseState: IKiloBase = {
  hcaptcha: '5ba581fa-b6fc-4bb0-8222-02fcd6a59e35',
  hcaptcha_api : 'https://js.hcaptcha.com/1/api.js',
  api: 'https://supabase.kbve.com',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NTM2ODAwLAogICJleHAiOiAxODgyMzAzMjAwCn0._fmEmblm0afeLoPXxt8wP2mYpa9gzU-ufx3v8oRTFGg',
};

// Create a stateful object with built-in methods for state management
const KiloBaseState = {
    // Holds the current state
    _state: { ...defaultKiloBaseState },
  
    /**
     * Getter for the current state.
     * @returns A copy of the current state.
     */
    get(): IKiloBase {
      return { ...this._state };
    },
  
    /**
     * Setter to update the state with new values.
     * @param newState A partial object containing the properties to update.
     */
    set(newState: Partial<IKiloBase>): void {
      this._state = { ...this._state, ...newState };
    },
  
    /**
     * Reset the state back to the default values.
     */
    reset(): void {
      this._state = { ...defaultKiloBaseState };
    },
  
    /**
     * String representation of the current state for debugging.
     * @returns A stringified version of the current state.
     */
    toString(): string {
      return JSON.stringify(this._state, null, 2);
    },
  
    /**
     * Additional function to get a specific key from the state.
     * @param key The key to retrieve from the state.
     * @returns The value associated with the provided key.
     */
    getKey(key: keyof IKiloBase): string | undefined {
      return this._state[key];
    },
  };
  
  // Export the stateful object as the default export
  export default KiloBaseState;