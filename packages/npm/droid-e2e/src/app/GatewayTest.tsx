import { useEffect, useState } from 'react';
import {
	detectCapabilities,
	selectStrategy,
	getStrategyDescription,
	type BrowserCapabilities,
	type StrategyType,
} from '@kbve/droid';

interface GatewayStatus {
	capabilities: BrowserCapabilities | null;
	strategy: StrategyType | null;
	description: string;
	detected: boolean;
}

export function GatewayTest() {
	const [status, setStatus] = useState<GatewayStatus>({
		capabilities: null,
		strategy: null,
		description: '',
		detected: false,
	});

	useEffect(() => {
		const caps = detectCapabilities();
		const strategy = selectStrategy(caps);
		const description = getStrategyDescription(strategy);

		setStatus({
			capabilities: caps,
			strategy,
			description,
			detected: true,
		});
	}, []);

	return (
		<div data-testid="gateway-test" style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
			<h2>Gateway Strategy Detection</h2>

			<div data-testid="gateway-detected" data-value={String(status.detected)}>
				Detection Complete: {status.detected ? 'Yes' : 'No'}
			</div>

			<div data-testid="gateway-strategy" data-value={status.strategy ?? ''}>
				Selected Strategy: {status.strategy ?? 'unknown'}
			</div>

			<div data-testid="gateway-description" data-value={status.description}>
				Description: {status.description}
			</div>

			{status.capabilities && (
				<div data-testid="gateway-capabilities">
					<h3>Browser Capabilities</h3>
					<div data-testid="cap-shared-worker" data-value={String(status.capabilities.hasSharedWorker)}>
						SharedWorker: {status.capabilities.hasSharedWorker ? 'Yes' : 'No'}
					</div>
					<div data-testid="cap-worker" data-value={String(status.capabilities.hasWorker)}>
						Worker: {status.capabilities.hasWorker ? 'Yes' : 'No'}
					</div>
					<div data-testid="cap-broadcast" data-value={String(status.capabilities.hasBroadcastChannel)}>
						BroadcastChannel: {status.capabilities.hasBroadcastChannel ? 'Yes' : 'No'}
					</div>
					<div data-testid="cap-android" data-value={String(status.capabilities.isAndroid)}>
						Android: {status.capabilities.isAndroid ? 'Yes' : 'No'}
					</div>
					<div data-testid="cap-safari" data-value={String(status.capabilities.isSafari)}>
						Safari: {status.capabilities.isSafari ? 'Yes' : 'No'}
					</div>
				</div>
			)}
		</div>
	);
}
