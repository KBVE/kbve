import { useEffect } from 'react';
import { InteractionManager, Platform } from 'react-native';

type IdleCallback<T = void> = (deadline: IdleDeadline) => T | void;

interface IdleOptions {
  timeout?: number;
}

interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining: () => number;
}

type InteractionHandle = ReturnType<typeof InteractionManager.runAfterInteractions>;

const requestIdleCallbackPolyfill = <T,>(
  callback: IdleCallback<T>, 
  options: IdleOptions = { timeout: 1000 }
): unknown => {
  if (typeof window !== 'undefined' && window.requestIdleCallback) {
    return window.requestIdleCallback(callback, options);
  }

  const start = Date.now();
  return setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
    });
  }, options.timeout);
};

const cancelIdleCallbackPolyfill = (id: unknown) => {
  if (typeof window !== 'undefined' && window.cancelIdleCallback) {
    window.cancelIdleCallback(id as number);
  } else {
    clearTimeout(id as ReturnType<typeof setTimeout>); 
  }
};

export const useIdleCallback = <T,>(callback: IdleCallback<T>, options?: IdleOptions) => {
  useEffect(() => {
    const idleTask = Platform.OS === 'web'
      ? requestIdleCallbackPolyfill(callback, options)
      : InteractionManager.runAfterInteractions(() => callback({ didTimeout: false, timeRemaining: () => 50 }));

    return () => {
      if (Platform.OS === 'web') {
        cancelIdleCallbackPolyfill(idleTask);
      } else if (typeof idleTask === 'object' && idleTask !== null && 'cancel' in idleTask) {
        (idleTask as InteractionHandle).cancel();
      }
    };
  }, [callback, options]);
};

export default useIdleCallback;
