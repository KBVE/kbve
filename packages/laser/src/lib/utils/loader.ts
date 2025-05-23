//  loader.ts
//  [IMPORTS]
import { Debug } from './debug';
import { LoaderOptions } from '../../types';

//  [CORE]

/**
 * Removes a loader element from the DOM.
 * The function tries to find the loader element by its ID or name, applies a fade-out transition, and then hides it.
 * Optionally, a callback function can be executed once the hiding process is complete.
 *
 * @param {LoaderOptions} options - The configuration options for removing the loader.
 * @param {string} options.elementIdOrName - The ID or name of the loader element to be removed.
 * @param {number} [options.duration=500] - The duration of the fade-out transition in milliseconds. Default is 500ms.
 * @param {() => void} [options.onComplete] - Optional callback function to be executed after the loader is removed.
 *
 * @remarks
 * - If no element is found by the given ID or name, the function will log an error using `Debug.error`.
 * - The function uses the `opacity-0` and `transition-opacity` CSS classes for the fade-out effect.
 *
 * @example
 * ```typescript
 * removeLoader({
 *   elementIdOrName: 'myLoader',
 *   duration: 300,
 *   onComplete: () => console.log('Loader removed!'),
 * });
 * ```
 */
export function removeLoader(options: LoaderOptions) {
  const { elementIdOrName, duration = 500, onComplete } = options;
  let loader: HTMLElement | null = null;

  loader = document.getElementById(elementIdOrName);

  if (!loader) {
    const elementsByName = document.getElementsByName(elementIdOrName);
    if (elementsByName.length > 0) {
      loader = elementsByName[0] as HTMLElement;
    }
  }

  if (!loader) {
    Debug.error(
      `Loader element with ID or name "${elementIdOrName}" not found.`,
    );
    return;
  }

  if (!(loader instanceof HTMLElement)) {
    Debug.error(`Element found by "${elementIdOrName}" is not an HTMLElement.`);
    return;
  }

  Debug.log(
    `Removing loader element with ID or name "${elementIdOrName}" with duration ${duration}ms.`,
  );

  loader.classList.add(
    'opacity-0',
    'transition-opacity',
    `duration-${duration}`,
  );

  setTimeout(() => {
    if(loader)
    {
      loader.style.display = 'none';
    }
    Debug.log(
      `Loader element with ID or name "${elementIdOrName}" has been hidden.`,
    );

    // Call the optional onComplete callback if provided
    if (onComplete) {
      onComplete();
    }
  }, duration); 
}


/**
 * Adds a loader element to the DOM.
 * The function tries to find the loader element by its ID or name and displays it.
 * If no element is found, a new loader element is created and added to the DOM.
 * Optionally, a callback function can be executed once the loader is displayed.
 *
 * @param {LoaderOptions} options - The configuration options for adding the loader.
 * @param {string} options.elementIdOrName - The ID or name of the loader element to be added.
 * @param {number} [options.duration=500] - The duration of the fade-in transition in milliseconds. Default is 500ms.
 * @param {() => void} [options.onComplete] - Optional callback function to be executed after the loader is added.
 *
 * @remarks
 * - If no element is found by the given ID or name, a new loader element is created with default styles.
 * - The function uses the `opacity-100` and `transition-opacity` CSS classes for the fade-in effect.
 *
 * @example
 * ```typescript
 * addLoader({
 *   elementIdOrName: 'myLoader',
 *   duration: 300,
 *   onComplete: () => console.log('Loader added!'),
 * });
 * ```
 */
export function addLoader(options: LoaderOptions) {
  const { elementIdOrName, duration = 500, onComplete } = options;
  let loader: HTMLElement | null = null;

  // Try to get the element by ID first
  loader = document.getElementById(elementIdOrName);

  // If not found by ID, try to get the element by name
  if (!loader) {
    const elementsByName = document.getElementsByName(elementIdOrName);
    if (elementsByName.length > 0) {
      loader = elementsByName[0] as HTMLElement;
    }
  }

  // If loader is still not found, create a new one
  if (!loader) {
    loader = document.createElement('div');
    loader.id = elementIdOrName;
    loader.classList.add(
      'z-[1000]',
      'fixed',
      'top-0',
      'left-0',
      'w-full',
      'h-full',
      'flex',
      'items-center',
      'justify-center',
      'bg-gray-100',
      'opacity-100',
      'transition-opacity',
      `duration-${duration}`,
    );
    loader.innerHTML = `
        <div class="loader"></div>
        <style>
          .loader {
            border: 16px solid #f3f3f3;
            border-top: 16px solid #3498db;
            border-radius: 50%;
            width: 120px;
            height: 120px;
            animation: spin 2s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;
    document.body.appendChild(loader);
  }

  if (!(loader instanceof HTMLElement)) {
    Debug.error(`Element found by "${elementIdOrName}" is not an HTMLElement.`);
    return;
  }

  Debug.log(
    `Adding loader element with ID or name "${elementIdOrName}" with duration ${duration}ms.`,
  );

  loader.style.display = 'block';
  loader.classList.remove('opacity-0');
  loader.classList.add('opacity-100');

  // Call the optional onComplete callback if provided
  if (onComplete) {
    setTimeout(() => {
      onComplete();
    }, duration);
  }
}
