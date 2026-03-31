import { useEffect, useState } from 'react';

/**
 * Hook that watches for a section becoming active via the GSAP controller.
 * The GSAP script sets `data-active-section` on `<html>` with the current index.
 * Once a section has been activated, `hasActivated` stays true permanently
 * (charts render once and stay).
 */
export function useKanbanSection(sectionIndex: number): boolean {
	const [hasActivated, setHasActivated] = useState(false);

	useEffect(() => {
		if (hasActivated) return;

		const check = () => {
			const attr = document.documentElement.getAttribute(
				'data-active-section',
			);
			if (attr != null && parseInt(attr, 10) === sectionIndex) {
				setHasActivated(true);
			}
		};

		// Check immediately in case we're already on this section
		check();

		const observer = new MutationObserver(check);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-active-section'],
		});

		return () => observer.disconnect();
	}, [sectionIndex, hasActivated]);

	return hasActivated;
}

/**
 * Shared kanban types used across chart islands.
 */
export interface KanbanItem {
	type: 'ISSUE' | 'PULL_REQUEST';
	number: number;
	title: string;
	state: string;
	url: string;
	assignees: string[];
	labels: string[];
	matrix: string | null;
	date: string;
	milestone: string | null;
}

export interface KanbanData {
	generated_at: string;
	project: { title: string; url: string; total_items: number };
	summary: Record<string, number>;
	columns: Record<string, KanbanItem[]>;
}

export const COLUMN_COLORS: Record<string, string> = {
	Theory: '#8b5cf6',
	AI: '#06b6d4',
	Todo: '#3b82f6',
	Backlog: '#6366f1',
	Error: '#ef4444',
	Support: '#f59e0b',
	Staging: '#f97316',
	Review: '#eab308',
	Done: '#22c55e',
};

export const COLUMN_ORDER = [
	'Theory',
	'AI',
	'Todo',
	'Backlog',
	'Error',
	'Support',
	'Staging',
	'Review',
	'Done',
];

/**
 * Shared hook to fetch kanban data. Each island can call this independently
 * (browser caches the response). Returns [data, error].
 */
export function useKanbanData(): [KanbanData | null, string | null] {
	const [data, setData] = useState<KanbanData | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch('/data/nx/nx-kanban.json', { signal: AbortSignal.timeout(10000) })
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((d: KanbanData) => {
				if (!cancelled) setData(d);
			})
			.catch((e) => {
				if (!cancelled) setError(e.message);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return [data, error];
}
