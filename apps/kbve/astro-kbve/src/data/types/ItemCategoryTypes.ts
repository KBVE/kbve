export enum ItemCategoryFlags {
	None = 0,
	Weapon = 0x00000001,
	Armor = 0x00000002,
	Tool = 0x00000004,
	Food = 0x00000008,
	Drink = 0x00000010,
	Potion = 0x00000020,
	Material = 0x00000040,
	Resource = 0x00000080,
	Skilling = 0x00000100,
	Combat = 0x00000200,
	Structure = 0x00000400,
	Magic = 0x00000800,
	Quest = 0x00001000,
	Utility = 0x00002000,
	Depletable = 0x00004000,
	Legendary = 0x00008000,
	Vehicle = 0x00010000,
	Pet = 0x00020000,
	Soul = 0x40000000,
}

export type CategoryName = keyof typeof ItemCategoryFlags;

export const AllItemCategoryNames: (keyof typeof ItemCategoryFlags)[] = (
	Object.keys(ItemCategoryFlags) as (keyof typeof ItemCategoryFlags)[]
).filter(
	(k) =>
		typeof ItemCategoryFlags[k] === 'number' && ItemCategoryFlags[k] !== 0,
);

export function getCategoryValue(
	names: (keyof typeof ItemCategoryFlags)[],
): number {
	let value = 0;
	for (const name of names) {
		value |= ItemCategoryFlags[name];
	}
	return value;
}

export function getCategoryNames(
	mask: number,
): (keyof typeof ItemCategoryFlags)[] {
	return AllItemCategoryNames.filter((name) => {
		const val = ItemCategoryFlags[name];
		return (mask & val) === val;
	});
}

export function hasCategory(
	mask: number,
	category: keyof typeof ItemCategoryFlags,
): boolean {
	return (mask & ItemCategoryFlags[category]) !== 0;
}

export function getMaxItemCategory(): number {
	return Object.values(ItemCategoryFlags).reduce(
		(acc, val) => (typeof val === 'number' ? acc | val : acc),
		0,
	);
}
