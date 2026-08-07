import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { commands } from '@/bindings';
import { base64ToBytes } from '@/views/terminal-codec';

const TERMINAL_BG = '#1a1d23';

interface SessionTerminalProps {
	sessionName: string;
}

export const SessionTerminal: React.FC<SessionTerminalProps> = ({
	sessionName,
}) => {
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
		let opened = false;

		const initTerminal = async () => {
			term = new Terminal({
				fontFamily:
					'Menlo, Monaco, "Cascadia Code", "Courier New", monospace',
				fontSize: 13,
				cursorBlink: true,
				scrollback: 0,
				theme: {
					background: TERMINAL_BG,
				},
			});

			fitAddon = new FitAddon();
			term.loadAddon(fitAddon);
			term.loadAddon(new WebLinksAddon());

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

			const res = await commands.openTmuxTerminal(
				sessionName,
				term.cols,
				term.rows,
			);
			if (res.status !== 'ok') {
				term.write(`\r\n${String(res.error)}\r\n`);
				return;
			}
			const id = res.data;
			paneId = id;
			opened = true;

			unlistenData = await listen<string>(
				`terminal://data/${id}`,
				(event) => {
					term?.write(base64ToBytes(event.payload));
				},
			);

			unlistenExit = await listen<{ code: number | null }>(
				`terminal://exit/${id}`,
				() => {
					term?.write('\r\n\x1b[2m[detached]\x1b[0m\r\n');
				},
			);

			term.onData((data) => {
				commands.terminalWrite(id, data).catch(() => undefined);
			});

			if (disposed) {
				unlistenData?.();
				unlistenExit?.();
				term.dispose();
				commands.terminalClose(id).catch(() => undefined);
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
					commands
						.terminalResize(id, term.rows, term.cols)
						.catch(() => undefined);
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
			if (opened && paneId) {
				commands.terminalClose(paneId).catch(() => undefined);
			}
		};
	}, [sessionName]);

	return (
		<div
			ref={containerRef}
			className="h-full w-full"
			style={{
				padding: '8px',
				backgroundColor: TERMINAL_BG,
			}}
		/>
	);
};
