import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../stores/terminal';
import { base64ToBytes } from './terminal-codec';

const TERMINAL_BG = '#1a1d23';

export function TerminalView() {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let paneId: string | null = null;
		let term: Terminal | null = null;
		let fitAddon: FitAddon | null = null;
		let resizeTimer: ReturnType<typeof setTimeout> | null = null;
		let unlistenData: (() => void) | null = null;
		let unlistenExit: (() => void) | null = null;
		let disposed = false;
		let initCompleted = false;

		const initTerminal = async () => {
			paneId = useTerminalStore.getState().addPane();
			const id = paneId;

			term = new Terminal({
				fontFamily:
					'Menlo, Monaco, "Cascadia Code", "Courier New", monospace',
				fontSize: 13,
				cursorBlink: true,
				scrollback: 5000,
				theme: {
					background: TERMINAL_BG,
				},
			});

			fitAddon = new FitAddon();
			term.loadAddon(fitAddon);
			term.loadAddon(new WebLinksAddon());
			term.loadAddon(new SearchAddon());

			try {
				const webglAddon = new WebglAddon();
				webglAddon.onContextLoss(() => {
					webglAddon.dispose();
				});
				term.loadAddon(webglAddon);
			} catch {
				void 0;
			}

			term.open(container);
			fitAddon.fit();

			unlistenData = await listen<string>(
				`terminal://data/${id}`,
				(event) => {
					term?.write(base64ToBytes(event.payload));
				},
			);

			unlistenExit = await listen<{ code: number | null }>(
				`terminal://exit/${id}`,
				(event) => {
					useTerminalStore
						.getState()
						.setPaneStatus(
							id,
							'exited',
							event.payload.code ?? null,
						);
					term?.write('\r\n\x1b[2m[process exited]\x1b[0m\r\n');
				},
			);

			if (disposed) {
				unlistenData();
				unlistenExit();
				term.dispose();
				useTerminalStore.getState().removePane(id);
				return;
			}

			let openCompleted = false;
			try {
				await invoke('terminal_open', {
					paneId: id,
					cols: term.cols,
					rows: term.rows,
				});
				openCompleted = true;
				useTerminalStore.getState().setPaneStatus(id, 'running', null);
			} catch (err) {
				useTerminalStore.getState().setPaneStatus(id, 'error', null);
				term.write(`\r\n${String(err)}\r\n`);
			}

			term.onData((data) => {
				invoke('terminal_write', { paneId: id, data }).catch(
					() => undefined,
				);
			});

			if (disposed) {
				unlistenData();
				unlistenExit();
				term.dispose();
				if (openCompleted) {
					invoke('terminal_close', { paneId: id }).catch(
						() => undefined,
					);
				}
				useTerminalStore.getState().removePane(id);
			} else {
				initCompleted = true;
			}
		};

		let initialized = false;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const { width, height } = entry.contentRect;
			if (width === 0 || height === 0) return;

			if (!initialized) {
				initialized = true;
				void initTerminal();
				return;
			}

			if (!fitAddon || !term || !paneId) return;
			const id = paneId;
			if (resizeTimer) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				fitAddon?.fit();
				if (term) {
					invoke('terminal_resize', {
						paneId: id,
						rows: term.rows,
						cols: term.cols,
					}).catch(() => undefined);
				}
			}, 50);
		});

		observer.observe(container);

		return () => {
			disposed = true;
			observer.disconnect();
			if (resizeTimer) clearTimeout(resizeTimer);
			unlistenData?.();
			unlistenExit?.();
			term?.dispose();
			if (initCompleted && paneId) {
				invoke('terminal_close', { paneId }).catch(() => undefined);
				useTerminalStore.getState().removePane(paneId);
			}
		};
	}, []);

	return (
		<div
			ref={containerRef}
			className="h-full w-full rounded-lg"
			style={{
				padding: '10px',
				backgroundColor: TERMINAL_BG,
			}}
		/>
	);
}
