import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
	deployService,
	TEMPLATES,
	type DeployedEndpoint,
} from './deployService';
import { vmService } from './vmService';
import {
	Rocket,
	Square,
	RefreshCw,
	ExternalLink,
	Copy,
	CheckCircle2,
} from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Extension } from '@codemirror/state';

function langExtension(language: string): Extension {
	switch (language) {
		case 'python':
			return python();
		case 'javascript':
			return javascript();
		default:
			return [];
	}
}

interface CopyButtonProps {
	value: string;
}

function CopyButton({ value }: CopyButtonProps) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() => {
				void navigator.clipboard
					.writeText(value)
					.then(() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 1200);
					})
					.catch(() => {});
			}}
			className="deploy-copy"
			aria-label="Copy">
			{copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
		</button>
	);
}

interface EndpointRowProps {
	endpoint: DeployedEndpoint;
	onStop: (name: string) => void;
	stopping: boolean;
}

function EndpointRow({ endpoint, onStop, stopping }: EndpointRowProps) {
	const url = deployService.urlFor(endpoint.name);
	const absolute =
		typeof window !== 'undefined'
			? new URL(url, window.location.origin).toString()
			: url;
	return (
		<tr>
			<td>
				<code>{endpoint.name}</code>
			</td>
			<td>
				<code>{endpoint.rootfs}</code>
			</td>
			<td>
				<code>
					{endpoint.ip}:{endpoint.http_port}
				</code>
			</td>
			<td>
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className="deploy-link">
					{url} <ExternalLink size={12} />
				</a>{' '}
				<CopyButton value={absolute} />
			</td>
			<td>
				<button
					type="button"
					onClick={() => onStop(endpoint.name)}
					disabled={stopping}
					className="deploy-stop"
					aria-label={`Stop ${endpoint.name}`}>
					<Square size={12} />
					Stop
				</button>
			</td>
		</tr>
	);
}

export default function ReactDeployPanel() {
	const phase = useStore(deployService.$phase);
	const error = useStore(deployService.$error);
	const template = useStore(deployService.$template);
	const name = useStore(deployService.$name);
	const code = useStore(deployService.$code);
	const port = useStore(deployService.$port);
	const endpoints = useStore(deployService.$endpoints);
	const lastDeployed = useStore(deployService.$lastDeployedName);
	const token = useStore(vmService.$accessToken);

	const editorRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const langCompartment = useRef(new Compartment());

	const [stoppingName, setStoppingName] = useState<string | null>(null);

	// Mount editor once.
	useEffect(() => {
		if (!editorRef.current || viewRef.current) return;
		const state = EditorState.create({
			doc: deployService.$code.get(),
			extensions: [
				basicSetup,
				keymap.of([]),
				oneDark,
				langCompartment.current.of(langExtension(template.language)),
				EditorView.updateListener.of((v) => {
					if (v.docChanged) {
						deployService.$code.set(v.state.doc.toString());
					}
				}),
				EditorView.theme({
					'&': { height: '320px', fontSize: '13px' },
					'.cm-content': {
						fontFamily:
							'ui-monospace, SFMono-Regular, Menlo, monospace',
					},
				}),
			],
		});
		viewRef.current = new EditorView({ state, parent: editorRef.current });
		return () => {
			viewRef.current?.destroy();
			viewRef.current = null;
		};
	}, []);

	// Swap language extension when template changes.
	useEffect(() => {
		if (!viewRef.current) return;
		viewRef.current.dispatch({
			effects: langCompartment.current.reconfigure(
				langExtension(template.language),
			),
		});
	}, [template.language]);

	// Sync editor when code resets via template switch.
	useEffect(() => {
		if (!viewRef.current) return;
		if (viewRef.current.state.doc.toString() !== code) {
			viewRef.current.dispatch({
				changes: {
					from: 0,
					to: viewRef.current.state.doc.length,
					insert: code,
				},
			});
		}
	}, [code]);

	// Pull endpoint list on mount + every 15s.
	useEffect(() => {
		if (!token) return;
		void deployService.refresh(token);
		const id = window.setInterval(() => {
			if (token) void deployService.refresh(token);
		}, 15000);
		return () => window.clearInterval(id);
	}, [token]);

	const handleDeploy = useCallback(() => {
		if (!token) return;
		void deployService.deploy(token);
	}, [token]);

	const handleStop = useCallback(
		(target: string) => {
			if (!token) return;
			setStoppingName(target);
			void deployService
				.stop(token, target)
				.finally(() => setStoppingName(null));
		},
		[token],
	);

	const submitting = phase === 'submitting';

	return (
		<section className="deploy-panel not-content">
			<header className="deploy-head">
				<h2 className="deploy-title">
					<Rocket size={16} /> Deploy
				</h2>
				<p className="deploy-sub">
					Boot a persistent firecracker-ctl-net microVM serving your
					code on an HTTP endpoint. Staff-gated. Endpoint stays up
					until you stop it.
				</p>
			</header>

			<div className="deploy-form">
				<label className="deploy-field">
					<span>Template</span>
					<select
						value={template.id}
						onChange={(e) =>
							deployService.selectTemplate(e.target.value)
						}>
						{TEMPLATES.map((t) => (
							<option key={t.id} value={t.id}>
								{t.label}
							</option>
						))}
					</select>
				</label>

				<label className="deploy-field">
					<span>Name</span>
					<input
						type="text"
						value={name}
						onChange={(e) =>
							deployService.$name.set(e.target.value)
						}
						placeholder="my-api"
						maxLength={39}
					/>
				</label>

				<label className="deploy-field">
					<span>Port</span>
					<input
						type="number"
						min={1024}
						max={65535}
						value={port}
						onChange={(e) =>
							deployService.$port.set(Number(e.target.value) || 0)
						}
					/>
				</label>

				<label className="deploy-field deploy-field--meta">
					<span>Entrypoint</span>
					<code>{template.entrypoint}</code>
				</label>

				<label className="deploy-field deploy-field--meta">
					<span>Rootfs</span>
					<code>{template.rootfs}</code>
				</label>
			</div>

			<div ref={editorRef} className="deploy-editor" />

			<div className="deploy-actions">
				<button
					type="button"
					onClick={handleDeploy}
					disabled={submitting || !token}
					className="deploy-submit">
					<Rocket size={14} /> {submitting ? 'Deploying…' : 'Deploy'}
				</button>
				<button
					type="button"
					onClick={() => token && void deployService.refresh(token)}
					disabled={!token}
					className="deploy-refresh"
					aria-label="Refresh endpoint list">
					<RefreshCw size={14} />
				</button>
			</div>

			{error && <div className="deploy-error">{error}</div>}

			{phase === 'ready' && lastDeployed && (
				<div className="deploy-ready">
					Deployed{' '}
					<a
						href={deployService.urlFor(lastDeployed)}
						target="_blank"
						rel="noopener noreferrer">
						{deployService.urlFor(lastDeployed)}
					</a>
				</div>
			)}

			<div className="deploy-list">
				<h3>Running endpoints ({endpoints.length})</h3>
				{endpoints.length === 0 ? (
					<p className="deploy-empty">No persistent endpoints yet.</p>
				) : (
					<table className="deploy-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Rootfs</th>
								<th>IP:Port</th>
								<th>URL</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{endpoints.map((ep) => (
								<EndpointRow
									key={ep.name}
									endpoint={ep}
									onStop={handleStop}
									stopping={stoppingName === ep.name}
								/>
							))}
						</tbody>
					</table>
				)}
			</div>

			<style>{`
				.deploy-panel { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; border: 1px solid rgba(255,255,255,0.08); border-radius: 0.5rem; background: rgba(255,255,255,0.02); }
				.deploy-head { display: flex; flex-direction: column; gap: 0.25rem; }
				.deploy-title { display: inline-flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1rem; }
				.deploy-sub { margin: 0; opacity: 0.7; font-size: 0.85rem; }
				.deploy-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
				.deploy-field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; }
				.deploy-field span { opacity: 0.7; }
				.deploy-field input, .deploy-field select { padding: 0.4rem 0.5rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 0.25rem; color: inherit; font: inherit; }
				.deploy-field--meta code { padding: 0.4rem 0.5rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.25rem; font-size: 0.78rem; }
				.deploy-editor { border: 1px solid rgba(255,255,255,0.08); border-radius: 0.25rem; overflow: hidden; }
				.deploy-actions { display: flex; gap: 0.5rem; align-items: center; }
				.deploy-submit, .deploy-refresh, .deploy-stop, .deploy-copy { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.7rem; border: 1px solid rgba(255,255,255,0.12); border-radius: 0.25rem; background: rgba(255,255,255,0.04); color: inherit; cursor: pointer; font: inherit; }
				.deploy-submit { background: rgba(34,197,94,0.18); border-color: rgba(34,197,94,0.45); }
				.deploy-submit:disabled { opacity: 0.5; cursor: not-allowed; }
				.deploy-copy { padding: 0.2rem 0.35rem; }
				.deploy-stop { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.45); }
				.deploy-error { padding: 0.5rem 0.7rem; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.4); border-radius: 0.25rem; font-size: 0.85rem; }
				.deploy-ready { padding: 0.5rem 0.7rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.4); border-radius: 0.25rem; font-size: 0.85rem; }
				.deploy-list h3 { margin: 0 0 0.5rem 0; font-size: 0.9rem; }
				.deploy-empty { margin: 0; opacity: 0.6; font-size: 0.85rem; }
				.deploy-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
				.deploy-table th, .deploy-table td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
				.deploy-table th { font-weight: 500; opacity: 0.7; }
				.deploy-link { display: inline-flex; align-items: center; gap: 0.25rem; }
			`}</style>
		</section>
	);
}
