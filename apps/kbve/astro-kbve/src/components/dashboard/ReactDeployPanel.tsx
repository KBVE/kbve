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
	FileText,
	X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip } from './Tooltip';
import { BillingErrorBanner } from './BillingErrorBanner';
import { parseBillingError } from './billingError';
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
	onLogs: (name: string) => void;
	stopping: boolean;
}

function EndpointRow({ endpoint, onStop, onLogs, stopping }: EndpointRowProps) {
	const url = deployService.urlFor(endpoint.name);
	const publicUrl =
		endpoint.visibility === 'public'
			? deployService.publicUrlFor(endpoint.name)
			: null;
	const absolute =
		typeof window !== 'undefined'
			? new URL(url, window.location.origin).toString()
			: url;
	const publicAbsolute =
		publicUrl && typeof window !== 'undefined'
			? new URL(publicUrl, window.location.origin).toString()
			: (publicUrl ?? '');
	const visibilityLabel = endpoint.visibility ?? 'staff';
	return (
		<tr>
			<td>
				<code>{endpoint.name}</code>{' '}
				<span
					className={`deploy-tier deploy-tier--${visibilityLabel}`}
					title={
						visibilityLabel === 'public'
							? 'Reachable via /fc/public/* without auth'
							: 'Staff JWT required'
					}>
					{visibilityLabel}
				</span>
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
				<div className="deploy-urls">
					<div className="deploy-url-row">
						<span className="deploy-url-tag">staff</span>
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							className="deploy-link">
							{url} <ExternalLink size={12} />
						</a>
						<CopyButton value={absolute} />
					</div>
					{publicUrl && (
						<div className="deploy-url-row">
							<span className="deploy-url-tag deploy-url-tag--public">
								public
							</span>
							<a
								href={publicUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="deploy-link">
								{publicUrl} <ExternalLink size={12} />
							</a>
							<CopyButton value={publicAbsolute} />
						</div>
					)}
				</div>
			</td>
			<td>
				<div className="deploy-row-actions">
					<button
						type="button"
						onClick={() => onLogs(endpoint.name)}
						className="deploy-logs-btn"
						aria-label={`Logs for ${endpoint.name}`}>
						<FileText size={12} />
						Logs
					</button>
					<button
						type="button"
						onClick={() => onStop(endpoint.name)}
						disabled={stopping}
						className="deploy-stop"
						aria-label={`Stop ${endpoint.name}`}>
						<Square size={12} />
						Stop
					</button>
				</div>
			</td>
		</tr>
	);
}

interface LogsModalProps {
	name: string;
	token: string;
	onClose: () => void;
}

function LogsModal({ name, token, onClose }: LogsModalProps) {
	const [logs, setLogs] = useState<string>('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const preRef = useRef<HTMLPreElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		const tick = async () => {
			try {
				const text = await deployService.fetchLogs(token, name);
				if (cancelled) return;
				setLogs(text);
				setError(null);
				setLoading(false);
				if (preRef.current) {
					preRef.current.scrollTop = preRef.current.scrollHeight;
				}
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
				setLoading(false);
			}
		};
		void tick();
		const id = window.setInterval(tick, 2000);
		return () => {
			cancelled = true;
			window.clearInterval(id);
		};
	}, [name, token]);

	return (
		<div className="deploy-logs-overlay" role="dialog" aria-modal="true">
			<div className="deploy-logs-modal">
				<header className="deploy-logs-head">
					<span>
						<FileText size={14} /> Logs · <code>{name}</code>
					</span>
					<button
						type="button"
						onClick={onClose}
						className="deploy-logs-close"
						aria-label="Close logs">
						<X size={14} />
					</button>
				</header>
				{loading && !logs && (
					<p className="deploy-logs-empty">Loading…</p>
				)}
				{error && <div className="deploy-error">{error}</div>}
				<pre ref={preRef} className="deploy-logs-pre">
					{logs || (loading ? '' : '(no output yet)')}
				</pre>
			</div>
		</div>
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
	const visibility = useStore(deployService.$visibility);
	const corsOrigins = useStore(deployService.$corsOriginsRaw);
	const rateRps = useStore(deployService.$rateRps);
	const rateBurst = useStore(deployService.$rateBurst);
	const idleTtl = useStore(deployService.$idleTtlSecs);
	const injectHeaders = useStore(deployService.$injectHeadersRaw);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const token = useStore(vmService.$accessToken);

	const editorRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const langCompartment = useRef(new Compartment());

	const [stoppingName, setStoppingName] = useState<string | null>(null);
	const [logsName, setLogsName] = useState<string | null>(null);
	const handleLogs = useCallback((name: string) => setLogsName(name), []);
	const handleCloseLogs = useCallback(() => setLogsName(null), []);

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

				<label className="deploy-field">
					<span>Visibility</span>
					<select
						value={visibility}
						onChange={(e) =>
							deployService.$visibility.set(
								e.target.value === 'public'
									? 'public'
									: 'staff',
							)
						}>
						<option value="staff">staff (JWT required)</option>
						<option value="public">
							public (anonymous /fc/public/*)
						</option>
					</select>
				</label>
			</div>

			<details
				className="deploy-advanced"
				open={showAdvanced}
				onToggle={(e) =>
					setShowAdvanced((e.target as HTMLDetailsElement).open)
				}>
				<summary>Advanced HTTP config</summary>
				<div className="deploy-form">
					<label className="deploy-field deploy-field--wide">
						<span>
							CORS allowed origins
							<small>(comma or newline; `*` for any)</small>
						</span>
						<textarea
							rows={2}
							value={corsOrigins}
							placeholder="https://kbve.com, https://*.kbve.com"
							onChange={(e) =>
								deployService.$corsOriginsRaw.set(
									e.target.value,
								)
							}
						/>
					</label>
					<label className="deploy-field deploy-field--wide">
						<span>
							Inject request headers
							<small>(one per line: `Name: value`)</small>
						</span>
						<textarea
							rows={3}
							value={injectHeaders}
							placeholder={
								'X-Endpoint-Name: my-api\nX-Tenant-Id: alpha'
							}
							onChange={(e) =>
								deployService.$injectHeadersRaw.set(
									e.target.value,
								)
							}
						/>
					</label>
					<label className="deploy-field">
						<span>Rate limit RPS</span>
						<input
							type="number"
							min={0}
							max={10000}
							value={rateRps}
							onChange={(e) =>
								deployService.$rateRps.set(
									Number(e.target.value) || 0,
								)
							}
						/>
					</label>
					<label className="deploy-field">
						<span>Rate burst</span>
						<input
							type="number"
							min={0}
							max={100000}
							value={rateBurst}
							onChange={(e) =>
								deployService.$rateBurst.set(
									Number(e.target.value) || 0,
								)
							}
						/>
					</label>
					<label className="deploy-field">
						<span>Idle TTL secs (0 = off)</span>
						<input
							type="number"
							min={0}
							value={idleTtl}
							onChange={(e) =>
								deployService.$idleTtlSecs.set(
									Number(e.target.value) || 0,
								)
							}
						/>
					</label>
				</div>
			</details>

			<div ref={editorRef} className="deploy-editor" />

			<div className="deploy-actions">
				<Tooltip
					content={
						submitting
							? 'Spawning the persistent VM…'
							: 'Reserve credits + spawn this endpoint'
					}
					side="top">
					<motion.button
						type="button"
						whileHover={{ scale: 1.03 }}
						whileTap={{ scale: 0.96 }}
						transition={{ duration: 0.1 }}
						onClick={handleDeploy}
						disabled={submitting || !token}
						className="deploy-submit">
						<Rocket size={14} />{' '}
						{submitting ? 'Deploying…' : 'Deploy'}
					</motion.button>
				</Tooltip>
				<Tooltip content="Refresh endpoint list" side="top">
					<motion.button
						type="button"
						whileHover={{ scale: 1.05, rotate: 90 }}
						whileTap={{ scale: 0.92 }}
						transition={{ duration: 0.15 }}
						onClick={() =>
							token && void deployService.refresh(token)
						}
						disabled={!token}
						className="deploy-refresh"
						aria-label="Refresh endpoint list">
						<RefreshCw size={14} />
					</motion.button>
				</Tooltip>
			</div>

			{error &&
				(parseBillingError(error) ? (
					<BillingErrorBanner info={parseBillingError(error)!} />
				) : (
					<div className="deploy-error">{error}</div>
				))}

			{phase === 'ready' && lastDeployed && (
				<div className="deploy-ready">
					Deployed{' '}
					<a
						href={deployService.urlFor(lastDeployed)}
						target="_blank"
						rel="noopener noreferrer">
						{deployService.urlFor(lastDeployed)}
					</a>
					{visibility === 'public' && (
						<>
							{' · public: '}
							<a
								href={deployService.publicUrlFor(lastDeployed)}
								target="_blank"
								rel="noopener noreferrer">
								{deployService.publicUrlFor(lastDeployed)}
							</a>
						</>
					)}
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
									onLogs={handleLogs}
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
				.deploy-field input, .deploy-field select, .deploy-field textarea { padding: 0.4rem 0.5rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 0.25rem; color: inherit; font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
					.deploy-field--wide { grid-column: 1 / -1; }
					.deploy-field small { opacity: 0.55; margin-left: 0.4rem; font-size: 0.7rem; }
					.deploy-advanced { border: 1px solid rgba(255,255,255,0.08); border-radius: 0.25rem; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.015); }
					.deploy-advanced summary { cursor: pointer; font-size: 0.85rem; opacity: 0.85; padding: 0.15rem 0; }
					.deploy-advanced[open] summary { margin-bottom: 0.6rem; }
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
				.deploy-urls { display: flex; flex-direction: column; gap: 0.3rem; }
				.deploy-url-row { display: inline-flex; align-items: center; gap: 0.4rem; }
				.deploy-url-tag { font-size: 0.65rem; padding: 0.05rem 0.35rem; border-radius: 0.2rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); opacity: 0.75; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
				.deploy-url-tag--public { background: rgba(34,197,94,0.14); border-color: rgba(34,197,94,0.35); color: rgba(134,239,172,0.95); opacity: 1; }
				.deploy-tier { font-size: 0.65rem; padding: 0.05rem 0.35rem; border-radius: 0.2rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); opacity: 0.75; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
				.deploy-tier--public { background: rgba(34,197,94,0.14); border-color: rgba(34,197,94,0.35); color: rgba(134,239,172,0.95); opacity: 1; }
				.deploy-row-actions { display: inline-flex; gap: 0.4rem; align-items: center; }
				.deploy-logs-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.55rem; border: 1px solid rgba(255,255,255,0.12); border-radius: 0.25rem; background: rgba(255,255,255,0.04); color: inherit; cursor: pointer; font: inherit; font-size: 0.78rem; }
				.deploy-logs-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 50; }
				.deploy-logs-modal { width: min(900px, 100%); max-height: 80vh; display: flex; flex-direction: column; background: #111; border: 1px solid rgba(255,255,255,0.12); border-radius: 0.5rem; overflow: hidden; }
				.deploy-logs-head { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 0.85rem; }
				.deploy-logs-close { background: transparent; border: none; color: inherit; cursor: pointer; padding: 0.2rem; }
				.deploy-logs-pre { margin: 0; padding: 0.8rem 1rem; overflow: auto; flex: 1; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; background: #0a0a0a; }
				.deploy-logs-empty { padding: 1rem; opacity: 0.6; font-size: 0.85rem; }
			`}</style>
			{logsName && token && (
				<LogsModal
					name={logsName}
					token={token}
					onClose={handleCloseLogs}
				/>
			)}
		</section>
	);
}
