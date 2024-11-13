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

const requestIdleCallbackPolyfill = <T,>(callback: IdleCallback<T>, options: IdleOptions = { timeout: 1000 }) => {
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

const cancelIdleCallbackPolyfill = (id: number | ReturnType<typeof setTimeout>) => {
  if (typeof window !== 'undefined' && window.cancelIdleCallback) {
    return window.cancelIdleCallback(id as number);
  }
  clearTimeout(id as ReturnType<typeof setTimeout>);
};

const useIdleCallback = <T,>(callback: IdleCallback<T>, options?: IdleOptions) => {
    useEffect(() => {
      const idleTask = Platform.OS === 'web'
        ? requestIdleCallbackPolyfill(callback, options)
        : InteractionManager.runAfterInteractions(() => callback({ didTimeout: false, timeRemaining: () => 50 }));
  
      return () => {
        if (Platform.OS === 'web') {
          cancelIdleCallbackPolyfill(idleTask as number);
        } else if (typeof idleTask === 'object' && 'cancel' in idleTask) {
            idleTask.cancel();
        }
      };
    }, [callback, options]);
  };

export default useIdleCallback;
