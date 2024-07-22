import { Debug } from './debug';
import { LoaderOptions } from '../../types';

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
    loader.style.display = 'none';
    Debug.log(
      `Loader element with ID or name "${elementIdOrName}" has been hidden.`,
    );

    // Call the optional onComplete callback if provided
    if (onComplete) {
      onComplete();
    }
  }, duration); 
}

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
