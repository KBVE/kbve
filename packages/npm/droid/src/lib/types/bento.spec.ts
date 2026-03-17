import { describe, it, expect } from 'vitest';
import {
	BentoTileSchema,
	BENTO_VARIANT_CLASS_MAP,
	BENTO_ANIMATION_CLASS_MAP,
	BENTO_BADGE_CLASS_MAP,
} from './bento';

const validTile = {
	title: 'Test Tile',
	primaryColor: 'blue-500',
	secondaryColor: 'red-300',
};

describe('BentoTileSchema', () => {
	it('accepts a minimal valid tile', () => {
		const result = BentoTileSchema.safeParse(validTile);
		expect(result.success).toBe(true);
	});

	it('rejects empty title', () => {
		const result = BentoTileSchema.safeParse({
			...validTile,
			title: '',
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid primary color format', () => {
		const result = BentoTileSchema.safeParse({
			...validTile,
			primaryColor: 'invalid',
		});
		expect(result.success).toBe(false);
	});

	it('accepts valid ULID id', () => {
		const result = BentoTileSchema.safeParse({
			...validTile,
			id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid ULID id', () => {
		const result = BentoTileSchema.safeParse({
			...validTile,
			id: 'not-a-ulid',
		});
		expect(result.success).toBe(false);
	});

	it('accepts valid span format', () => {
		const result = BentoTileSchema.safeParse({
			...validTile,
			span: 'col-span-2',
		});
		expect(result.success).toBe(true);
	});

	it('requires target when href is provided', () => {
		const result = BentoTileSchema.safeParse({
			...validTile,
			href: 'https://example.com',
		});
		expect(result.success).toBe(false);
	});

	it('accepts href with target', () => {
		const result = BentoTileSchema.safeParse({
			...validTile,
			href: 'https://example.com',
			target: '_blank',
		});
		expect(result.success).toBe(true);
	});

	it('requires badge text when badgeType is set', () => {
		const result = BentoTileSchema.safeParse({
			...validTile,
			badgeType: 'success',
		});
		expect(result.success).toBe(false);
	});

	it('accepts badge with badgeType', () => {
		const result = BentoTileSchema.safeParse({
			...validTile,
			badge: 'New',
			badgeType: 'success',
		});
		expect(result.success).toBe(true);
	});
});

describe('Bento class maps', () => {
	it('BENTO_VARIANT_CLASS_MAP has all variants', () => {
		expect(BENTO_VARIANT_CLASS_MAP).toHaveProperty('default');
		expect(BENTO_VARIANT_CLASS_MAP).toHaveProperty('minimal');
		expect(BENTO_VARIANT_CLASS_MAP).toHaveProperty('image-heavy');
	});

	it('BENTO_ANIMATION_CLASS_MAP has all animations', () => {
		expect(BENTO_ANIMATION_CLASS_MAP).toHaveProperty('fade-in');
		expect(BENTO_ANIMATION_CLASS_MAP).toHaveProperty('slide-up');
		expect(BENTO_ANIMATION_CLASS_MAP).toHaveProperty('none');
		expect(BENTO_ANIMATION_CLASS_MAP['none']).toBe('');
	});

	it('BENTO_BADGE_CLASS_MAP has all badge types', () => {
		expect(BENTO_BADGE_CLASS_MAP).toHaveProperty('default');
		expect(BENTO_BADGE_CLASS_MAP).toHaveProperty('success');
		expect(BENTO_BADGE_CLASS_MAP).toHaveProperty('warning');
		expect(BENTO_BADGE_CLASS_MAP).toHaveProperty('error');
	});
});
