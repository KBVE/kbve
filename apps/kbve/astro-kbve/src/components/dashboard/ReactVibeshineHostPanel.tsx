import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
	$apps,
	$appsStatus,
	$sessionStatus,
	$controlError,
	$hostStatus,
	fetchApps,
	fetchSessionStatus,
	fetchHostStatus,
	closeApp,
	launchApp,
} from './vibeshineService';

export default function ReactVibeshineHostPanel() {
	const apps = useStore($apps);
	const appsStatus = useStore($appsStatus);
	const sessionStatus = useStore($sessionStatus);
	const controlError = useStore($controlError);
	const hostStatus = useStore($hostStatus);

	useEffect(() => {
		void fetchHostStatus().then((status) => {
			if (status?.reachable) {
				void fetchApps();
				void fetchSessionStatus();
			}
		});
	}, []);

	const sessionActive =
		sessionStatus !== null &&
		Object.values(sessionStatus).some((v) => v === true || v === 'active');

	return (
		<div className="vibeshine-host">
			<div className="vibeshine-host__header">
				<h3>Host control</h3>
				<span
					className={
						hostStatus?.reachable
							? 'vibeshine-host__badge vibeshine-host__badge--up'
							: 'vibeshine-host__badge vibeshine-host__badge--down'
					}>
					{hostStatus?.reachable
						? `tunnel up · ${hostStatus.latency_ms ?? '?'} ms`
						: 'host unreachable'}
				</span>
			</div>
			{controlError && (
				<p className="vibeshine-host__error">{controlError}</p>
			)}
			<div className="vibeshine-host__apps">
				{appsStatus === 'loading' && <p>Loading apps…</p>}
				{appsStatus === 'error' && <p>Failed to load apps.</p>}
				{appsStatus === 'ok' && !apps?.length && (
					<p>No apps registered on the host.</p>
				)}
				{apps?.map((app, i) => (
					<div
						className="vibeshine-host__app"
						key={String(app.uuid ?? app.index ?? i)}>
						<span>{String(app.name ?? `app ${i}`)}</span>
						<button
							type="button"
							disabled={!hostStatus?.reachable}
							onClick={() => void launchApp(app)}>
							Launch
						</button>
					</div>
				))}
			</div>
			<div className="vibeshine-host__actions">
				<button
					type="button"
					disabled={!hostStatus?.reachable}
					onClick={() => void closeApp()}>
					Stop running app
				</button>
				<button
					type="button"
					onClick={() => {
						void fetchApps();
						void fetchSessionStatus();
					}}>
					Refresh
				</button>
				{sessionActive && (
					<span className="vibeshine-host__badge vibeshine-host__badge--up">
						session active
					</span>
				)}
			</div>
		</div>
	);
}
