// utils/debug.ts
import { getUserSetting, setUserSetting } from '../localdb';

const enableDebugMode = () => {
  setUserSetting('debugMode', true);
};

const disableDebugMode = () => {
  setUserSetting('debugMode', false);
};

const isDebugModeEnabled = (): boolean => {
  return getUserSetting('debugMode');
};

const formatMessage = (message: string | object): string => {
  return typeof message === 'string' ? message : JSON.stringify(message, null, 2);
};

const log = (message: string | object) => {
  if (isDebugModeEnabled()) {
    console.log(`[DEBUG] ${formatMessage(message)}`);
  }
};

const warn = (message: string | object) => {
  if (isDebugModeEnabled()) {
    console.warn(`[DEBUG] ${formatMessage(message)}`);
  }
};

const error = (message: string | object) => {
  if (isDebugModeEnabled()) {
    console.error(`[DEBUG] ${formatMessage(message)}`);
  }
};

export const Debug = {
  enable: enableDebugMode,
  disable: disableDebugMode,
  isEnabled: isDebugModeEnabled,
  log,
  warn,
  error,
};
