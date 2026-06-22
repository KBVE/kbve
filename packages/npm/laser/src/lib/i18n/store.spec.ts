import { describe, it, expect, vi } from 'vitest';
import { I18nStore } from './store';

describe('I18nStore', () => {
	it('returns the message for the active locale', () => {
		const s = new I18nStore({
			locale: 'en',
			messages: { en: { 'hud.hp': 'Health' } },
		});
		expect(s.t('hud.hp')).toBe('Health');
	});

	it('interpolates {var} placeholders', () => {
		const s = new I18nStore({
			messages: { en: { 'hud.value': '{cur} / {max}' } },
		});
		expect(s.t('hud.value', { cur: 30, max: 100 })).toBe('30 / 100');
	});

	it('leaves unknown placeholders intact', () => {
		const s = new I18nStore({
			messages: { en: { greet: 'Hi {name}' } },
		});
		expect(s.t('greet', {})).toBe('Hi {name}');
	});

	it('falls back to the fallback locale', () => {
		const s = new I18nStore({
			locale: 'fr',
			fallbackLocale: 'en',
			messages: { en: { 'hud.mp': 'Mana' }, fr: {} },
		});
		expect(s.t('hud.mp')).toBe('Mana');
	});

	it('returns the key when no translation exists', () => {
		const s = new I18nStore();
		expect(s.t('missing.key')).toBe('missing.key');
	});

	it('merges added bundles and notifies subscribers', () => {
		const s = new I18nStore({ messages: { en: { a: 'A' } } });
		const sub = vi.fn();
		s.subscribe(sub);
		s.add('en', { b: 'B' });
		expect(s.t('a')).toBe('A');
		expect(s.t('b')).toBe('B');
		expect(sub).toHaveBeenCalledTimes(1);
	});

	it('switches locale and notifies once, no-op on same locale', () => {
		const s = new I18nStore({
			messages: { en: { x: 'X' }, es: { x: 'EX' } },
		});
		const sub = vi.fn();
		s.subscribe(sub);
		s.setLocale('es');
		expect(s.getLocale()).toBe('es');
		expect(s.t('x')).toBe('EX');
		s.setLocale('es');
		expect(sub).toHaveBeenCalledTimes(1);
	});

	it('unsubscribe stops notifications', () => {
		const s = new I18nStore({ messages: { en: {} } });
		const sub = vi.fn();
		const off = s.subscribe(sub);
		off();
		s.setLocale('de');
		expect(sub).not.toHaveBeenCalled();
	});
});
