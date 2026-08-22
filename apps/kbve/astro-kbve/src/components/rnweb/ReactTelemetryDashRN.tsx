import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { ShieldOff } from 'lucide-react';
import { TelemetryView } from '@kbve/rn/dash';
import { $isStaff } from '@kbve/droid';
import { initSupa, getSupa } from '@/lib/supa';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa()
			.getSession()
			.catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

const styles = {
	centered: {
		display: 'flex',
		flexDirection: 'column' as const,
		alignItems: 'center',
		justifyContent: 'center',
		gap: '1rem',
		minHeight: '40vh',
		textAlign: 'center' as const,
	},
	heading: {
		margin: 0,
		fontSize: '1.75rem',
		color: 'var(--sl-color-text, #e6edf3)',
	},
	sub: {
		margin: 0,
		color: 'var(--sl-color-gray-3, #8b949e)',
		maxWidth: '40rem',
	},
};

export default function ReactTelemetryDashRN() {
	const isStaff = useStore($isStaff);
	const token = useMemo(() => getToken, []);

	if (!isStaff) {
		return (
			<div style={styles.centered}>
				<ShieldOff size={48} color="var(--sl-color-gray-3)" />
				<h2 style={styles.heading}>Staff Access Required</h2>
				<p style={styles.sub}>
					Client error telemetry is restricted to KBVE staff.
				</p>
			</div>
		);
	}

	// Not DASH_PROXY_BASE. That proxy targets kbve.com, which does not serve
	// /api/v1/groups — telemetry is its own origin, and its CORS layer already
	// allows Authorization from here, so it is called cross-origin directly.
	return <TelemetryView getToken={token} />;
}
