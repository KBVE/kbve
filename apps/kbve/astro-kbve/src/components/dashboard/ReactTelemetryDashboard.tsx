import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { groupEventCount, groupSessionCount } from '@kbve/devops/telemetry';
import { telemetryService } from './telemetryService';
import { AuthGate } from './dashboard-ui';

function GroupsPanel() {
	const groups = useStore(telemetryService.$groups);
	const loading = useStore(telemetryService.$groupsLoading);
	const error = useStore(telemetryService.$error);
	const project = useStore(telemetryService.$project);
	const selected = useStore(telemetryService.$selected);

	return (
		<div className="telemetry-groups">
			<div className="telemetry-toolbar">
				<input
					type="text"
					placeholder="Filter by project (e.g. astro-kbve)"
					value={project}
					onChange={(e) =>
						telemetryService.setProject(e.target.value)
					}
					onKeyDown={(e) => {
						if (e.key === 'Enter')
							void telemetryService.loadGroups();
					}}
				/>
				<button
					type="button"
					onClick={() => void telemetryService.loadGroups()}
					disabled={loading}>
					{loading ? (
						<Loader2 size={14} className="telemetry-spin" />
					) : (
						<RefreshCw size={14} />
					)}
					<span>Refresh</span>
				</button>
			</div>

			{error && <div className="telemetry-error">{error}</div>}

			<table className="telemetry-table">
				<thead>
					<tr>
						<th>Project</th>
						<th>Type</th>
						<th>Message</th>
						<th>Events</th>
						<th>Sessions</th>
						<th>Last seen</th>
					</tr>
				</thead>
				<tbody>
					{groups.map((g) => (
						<tr
							key={g.fingerprint}
							className={
								selected === g.fingerprint ? 'is-selected' : ''
							}
							onClick={() =>
								void telemetryService.drill(g.fingerprint)
							}>
							<td>{g.project}</td>
							<td>{g.error_type}</td>
							<td className="telemetry-msg">
								{g.sample_message}
							</td>
							<td>{groupEventCount(g)}</td>
							<td>{groupSessionCount(g)}</td>
							<td>{g.last_seen}</td>
						</tr>
					))}
					{!loading && groups.length === 0 && (
						<tr>
							<td colSpan={6} className="telemetry-empty">
								No error groups.
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

function EventsPanel() {
	const selected = useStore(telemetryService.$selected);
	const events = useStore(telemetryService.$events);
	const loading = useStore(telemetryService.$eventsLoading);

	if (!selected) return null;

	return (
		<div className="telemetry-events">
			<div className="telemetry-events-head">
				<h3>{selected.slice(0, 12)}</h3>
				<button
					type="button"
					onClick={() => telemetryService.clearSelection()}
					aria-label="Close">
					<X size={14} />
				</button>
			</div>
			{loading ? (
				<Loader2 size={16} className="telemetry-spin" />
			) : (
				<ul className="telemetry-event-list">
					{events.map((e, i) => (
						<li key={`${e.session_id}-${i}`}>
							<div className="telemetry-event-msg">
								{e.message}
							</div>
							<div className="telemetry-event-meta">
								{e.platform} · {e.environment || 'n/a'} ·{' '}
								{e.url}
							</div>
							{e.stack && <pre>{e.stack}</pre>}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default function ReactTelemetryDashboard() {
	const initAuth = useCallback(() => telemetryService.initAuth(), []);
	return (
		<AuthGate
			$authState={telemetryService.$authState}
			initAuth={initAuth}
			serviceName="Telemetry errors dashboard">
			<div className="telemetry-dashboard">
				<GroupsPanel />
				<EventsPanel />
			</div>
		</AuthGate>
	);
}
