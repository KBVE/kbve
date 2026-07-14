import raw from './categories.json';
import type { OsrsTag } from './tags';

export interface OsrsCategoryGroup {
	label: string;
	eyebrow: string;
	icon: string;
}

export interface OsrsCategory {
	slug: string;
	tag: OsrsTag;
	label: string;
	group: string;
	accent: string;
	blurb: string;
}

export const OSRS_CATEGORY_GROUPS: OsrsCategoryGroup[] = raw.groups;
export const OSRS_CATEGORIES: OsrsCategory[] = raw.categories as OsrsCategory[];

export const osrsCategoryHref = (slug: string): string =>
	`/osrs/category/${slug}/`;

export const findOsrsCategory = (slug: string): OsrsCategory | undefined =>
	OSRS_CATEGORIES.find((c) => c.slug === slug);
