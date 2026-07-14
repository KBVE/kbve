import { create } from 'zustand';

export interface PaneInfo {
	id: string;
	title: string;
	status: 'starting' | 'running' | 'exited' | 'error';
	exitCode?: number | null;
}

interface TerminalState {
	panes: PaneInfo[];
	activePaneId: string | null;
	nextPaneSeq: number;
	addPane: () => string;
	removePane: (id: string) => void;
	setActivePane: (id: string) => void;
	setPaneStatus: (
		id: string,
		status: PaneInfo['status'],
		exitCode?: number | null,
	) => void;
	setPaneTitle: (id: string, title: string) => void;
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
	panes: [],
	activePaneId: null,
	nextPaneSeq: 1,
	addPane: () => {
		const seq = get().nextPaneSeq;
		const id = `pane-${crypto.randomUUID()}`;
		set((s) => ({
			panes: [
				...s.panes,
				{ id, title: `Terminal ${seq}`, status: 'starting' },
			],
			activePaneId: id,
			nextPaneSeq: s.nextPaneSeq + 1,
		}));
		return id;
	},
	removePane: (id) =>
		set((s) => {
			const index = s.panes.findIndex((p) => p.id === id);
			if (index === -1) return s;
			const panes = [
				...s.panes.slice(0, index),
				...s.panes.slice(index + 1),
			];
			let activePaneId = s.activePaneId;
			if (s.activePaneId === id) {
				if (panes.length === 0) {
					activePaneId = null;
				} else {
					const neighborIndex = Math.min(
						Math.max(index - 1, 0),
						panes.length - 1,
					);
					activePaneId = panes[neighborIndex].id;
				}
			}
			return { panes, activePaneId };
		}),
	setActivePane: (id) =>
		set((s) => {
			if (!s.panes.some((p) => p.id === id)) return s;
			return { activePaneId: id };
		}),
	setPaneStatus: (id, status, exitCode) =>
		set((s) => ({
			panes: s.panes.map((p) =>
				p.id === id ? { ...p, status, exitCode } : p,
			),
		})),
	setPaneTitle: (id, title) =>
		set((s) => ({
			panes: s.panes.map((p) => (p.id === id ? { ...p, title } : p)),
		})),
}));
