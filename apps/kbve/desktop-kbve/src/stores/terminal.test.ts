import { describe, it, expect, beforeEach } from 'vitest';
import { useTerminalStore } from './terminal';

describe('Terminal Store', () => {
	beforeEach(() => {
		useTerminalStore.setState({
			panes: [],
			activePaneId: null,
			nextPaneSeq: 1,
		});
	});

	it('has correct initial state', () => {
		const state = useTerminalStore.getState();
		expect(state.panes).toEqual([]);
		expect(state.activePaneId).toBeNull();
	});

	describe('addPane', () => {
		it('returns the new pane id and adds it as starting and active', () => {
			const id = useTerminalStore.getState().addPane();
			expect(id).toBe('pane-1');
			const state = useTerminalStore.getState();
			expect(state.panes).toHaveLength(1);
			expect(state.panes[0]).toEqual({
				id: 'pane-1',
				title: 'Terminal 1',
				status: 'starting',
				exitCode: undefined,
			});
			expect(state.activePaneId).toBe('pane-1');
		});

		it('increments the sequence across adds and never reuses ids after removal', () => {
			const id1 = useTerminalStore.getState().addPane();
			const id2 = useTerminalStore.getState().addPane();
			expect(id1).toBe('pane-1');
			expect(id2).toBe('pane-2');
			useTerminalStore.getState().removePane(id2);
			const id3 = useTerminalStore.getState().addPane();
			expect(id3).toBe('pane-3');
		});

		it('makes the newly added pane active', () => {
			useTerminalStore.getState().addPane();
			const id2 = useTerminalStore.getState().addPane();
			expect(useTerminalStore.getState().activePaneId).toBe(id2);
		});
	});

	describe('removePane', () => {
		it('activates the previous neighbor when the active pane is removed', () => {
			const id1 = useTerminalStore.getState().addPane();
			const id2 = useTerminalStore.getState().addPane();
			const id3 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().setActivePane(id2);
			useTerminalStore.getState().removePane(id2);
			const state = useTerminalStore.getState();
			expect(state.panes.map((p) => p.id)).toEqual([id1, id3]);
			expect(state.activePaneId).toBe(id1);
		});

		it('activates the nearest remaining pane when the first (active) pane is removed', () => {
			const id1 = useTerminalStore.getState().addPane();
			const id2 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().setActivePane(id1);
			useTerminalStore.getState().removePane(id1);
			const state = useTerminalStore.getState();
			expect(state.panes.map((p) => p.id)).toEqual([id2]);
			expect(state.activePaneId).toBe(id2);
		});

		it('sets activePaneId to null when removing the last pane', () => {
			const id1 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().removePane(id1);
			const state = useTerminalStore.getState();
			expect(state.panes).toEqual([]);
			expect(state.activePaneId).toBeNull();
		});

		it('does not change activePaneId when removing an inactive pane', () => {
			const id1 = useTerminalStore.getState().addPane();
			const id2 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().removePane(id1);
			const state = useTerminalStore.getState();
			expect(state.panes.map((p) => p.id)).toEqual([id2]);
			expect(state.activePaneId).toBe(id2);
		});

		it('removing an unknown id is a no-op', () => {
			const id1 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().removePane('nonexistent');
			const state = useTerminalStore.getState();
			expect(state.panes.map((p) => p.id)).toEqual([id1]);
			expect(state.activePaneId).toBe(id1);
		});
	});

	describe('setActivePane', () => {
		it('sets the active pane to a known id', () => {
			const id1 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().addPane();
			useTerminalStore.getState().setActivePane(id1);
			expect(useTerminalStore.getState().activePaneId).toBe(id1);
		});

		it('is a no-op for an unknown id', () => {
			const id1 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().setActivePane('nonexistent');
			expect(useTerminalStore.getState().activePaneId).toBe(id1);
		});
	});

	describe('setPaneStatus', () => {
		it('updates the status of a pane', () => {
			const id1 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().setPaneStatus(id1, 'running');
			expect(useTerminalStore.getState().panes[0].status).toBe('running');
		});

		it('updates the status and exit code of a pane', () => {
			const id1 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().setPaneStatus(id1, 'exited', 0);
			const pane = useTerminalStore.getState().panes[0];
			expect(pane.status).toBe('exited');
			expect(pane.exitCode).toBe(0);
		});

		it('leaves other panes untouched', () => {
			const id1 = useTerminalStore.getState().addPane();
			const id2 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().setPaneStatus(id1, 'error', 1);
			const panes = useTerminalStore.getState().panes;
			expect(panes.find((p) => p.id === id2)?.status).toBe('starting');
		});
	});

	describe('setPaneTitle', () => {
		it('updates the title of a pane', () => {
			const id1 = useTerminalStore.getState().addPane();
			useTerminalStore.getState().setPaneTitle(id1, 'bash');
			expect(useTerminalStore.getState().panes[0].title).toBe('bash');
		});
	});
});
