import { useEffect, useRef } from 'react';
import { userClientService } from '../states/userClient';

/** 
 *  This Hook can be deleted, as its not needed.
 * 
 */

/**
 * Custom hook for safe user service initialization
 * Prevents multiple initializations and handles loading states
 */
export const useUserInitialization = () => {
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }

    const initializeUser = async () => {
      try {
        await userClientService.initialize();
        hasInitialized.current = true;
      } catch (error) {
        console.error('[useUserInitialization] Failed to initialize user service:', error);
      }
    };

    initializeUser();
  }, []);

  return { hasInitialized: hasInitialized.current };
};
