import type { SavedView } from './types';

export function makeViewId(name: string, index: number): string {
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	return `${slug || 'view'}-${index}`;
}

export function seedViews(seeded: SavedView[], stored: SavedView[]): SavedView[] {
	const byId = new Map<string, SavedView>();
	for (const s of seeded) byId.set(s.id, { ...s, seeded: true });
	for (const u of stored) byId.set(u.id, { ...byId.get(u.id), ...u });
	return [...byId.values()];
}

export function addView(views: SavedView[], view: SavedView): SavedView[] {
	return [...views.filter((v) => v.id !== view.id), view];
}

export function removeView(views: SavedView[], id: string): SavedView[] {
	return views.filter((v) => v.id !== id);
}

export function renameView(views: SavedView[], id: string, name: string): SavedView[] {
	return views.map((v) => (v.id === id ? { ...v, name } : v));
}

export function reorderViews(views: SavedView[], ids: string[]): SavedView[] {
	const byId = new Map(views.map((v) => [v.id, v]));
	const ordered = ids.map((id) => byId.get(id)).filter((v): v is SavedView => !!v);
	const rest = views.filter((v) => !ids.includes(v.id));
	return [...ordered, ...rest];
}

export function exportViews(views: SavedView[]): string {
	return JSON.stringify(views);
}

export function importViews(json: string): SavedView[] {
	const parsed = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error('views JSON must be an array');
	return parsed as SavedView[];
}
