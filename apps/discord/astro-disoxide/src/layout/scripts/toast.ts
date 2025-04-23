/// <reference lib="webworker" />

import { type ToastType } from 'src/env';

// @ts-ignore - ESM shim import
import createToast from 'https://esm.sh/toastify-js?worker';

// Tailwind-like theme color mapping
const tailwindColors: Record<ToastType, string> = {
  success: '#22c55e', // tailwind green-500
  error: '#ef4444',   // tailwind red-500
  info: '#3b82f6',    // tailwind blue-500
  warning: '#f59e0b'  // tailwind yellow-500
};

// Queue system
const toastQueue: any[] = [];
let isDisplaying = false;

function showNextToast() {
  if (toastQueue.length === 0) {
    isDisplaying = false;
    return;
  }

  isDisplaying = true;
  const { message, duration, backgroundColor } = toastQueue.shift();

  // @ts-ignore - global Toastify
  createToast({
    text: message,
    duration,
    gravity: 'top',
    position: 'right',
    backgroundColor,
    stopOnFocus: true,
    callback: () => {
      setTimeout(() => showNextToast(), 200); 
    }
  }).showToast();
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data;

  if (typeof data !== 'object' || !data.message) {
    console.warn('[ToastWorker] Invalid payload:', data);
    return;
  }

  const { message, duration = 3000, type = 'info' } = data;

  const backgroundColor = tailwindColors[type as ToastType] ?? tailwindColors.info;

  toastQueue.push({ message, duration, backgroundColor });

  if (!isDisplaying) {
    showNextToast();
  }
};