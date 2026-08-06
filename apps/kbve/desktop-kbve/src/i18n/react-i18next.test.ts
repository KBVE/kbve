import { describe, it, expect } from 'vitest';

import { t, useTranslation } from './react-i18next';

describe('react-i18next shim', () => {
	it('resolves known keys from the EN catalog', () => {
		expect(t('devops.title')).not.toBe('devops.title');
	});

	it('falls back to the key for unknown paths', () => {
		expect(t('no.such.key.anywhere')).toBe('no.such.key.anywhere');
	});

	it('uses the string default value form', () => {
		expect(t('no.such.key', 'fallback text')).toBe('fallback text');
	});

	it('uses defaultValue from the options form', () => {
		expect(t('no.such.key', { defaultValue: 'opt fallback' })).toBe(
			'opt fallback',
		);
	});

	it('interpolates variables in the 3-argument form', () => {
		expect(t('no.such.key', '{{count}}s ago', { count: 42 })).toBe(
			'42s ago',
		);
	});

	it('leaves unknown placeholders intact', () => {
		expect(t('no.such.key', 'hello {{name}}', {})).toBe('hello {{name}}');
	});

	it('useTranslation returns the same t', () => {
		const { t: hookT } = useTranslation();
		expect(hookT('no.such.key', 'x')).toBe('x');
	});
});
