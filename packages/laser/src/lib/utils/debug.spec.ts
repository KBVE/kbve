import { Debug } from './debug';
import { settings } from '../localdb';

describe('Debug utility', () => {
  beforeEach(() => {
    settings.set({
      tooltipItem: { id: null, position: { x: 0, y: 0 } },
      submenuItem: { id: null, position: { x: 0, y: 0 } },
      tooltipNPC: { id: null, position: { x: 0, y: 0 } },
      isStatsMenuCollapsed: false,
      debugMode: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should enable debug mode', () => {
    Debug.enable();
    expect(Debug.isEnabled()).toBe(true);
  });

  it('should disable debug mode', () => {
    Debug.enable();
    Debug.disable();
    expect(Debug.isEnabled()).toBe(false);
  });

  it('should log message in debug mode', () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    Debug.enable();
    Debug.log('Test log message');
    expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] Test log message');
  });

  it('should not log message when debug mode is disabled', () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    Debug.log('Test log message');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should log object in debug mode', () => {
    const consoleLogSpy = vi.spyOn(console, 'log');
    Debug.enable();
    Debug.log({ key: 'value' });
    expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] {\n  "key": "value"\n}');
  });

  it('should warn in debug mode', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn');
    Debug.enable();
    Debug.warn('Test warn message');
    expect(consoleWarnSpy).toHaveBeenCalledWith('[DEBUG] Test warn message');
  });

  it('should not warn when debug mode is disabled', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn');
    Debug.warn('Test warn message');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should error in debug mode', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    Debug.enable();
    Debug.error('Test error message');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[DEBUG] Test error message');
  });

  it('should not error when debug mode is disabled', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    Debug.error('Test error message');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
