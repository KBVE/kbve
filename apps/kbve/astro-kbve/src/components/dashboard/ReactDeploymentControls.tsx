import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';
import { RefreshCw, Filter } from 'lucide-react';
import { vmService } from './vmService';
import { deploymentHistoryService } from './deploymentHistoryService';

export default function ReactDeploymentControls() {
	const token = useStore(vmService.$accessToken);
	const loading = useStore(deploymentHistoryService.$loading);
	const liveOnly = useStore(deploymentHistoryService.$liveOnly);

	useEffect(() => {
		if (!token) return;
		void deploymentHistoryService.refresh(token);
	}, [token]);

	if (!token) return <div className="deploy-history-controls" />;

	return (
		<div className="deploy-history-controls">
			<label className="deploy-history-filter">
				<input
					type="checkbox"
					checked={liveOnly}
					onChange={(e) => {
						deploymentHistoryService.$liveOnly.set(
							e.target.checked,
						);
						void deploymentHistoryService.refresh(token);
					}}
				/>
				<Filter size={12} />
				Live only
			</label>
			<motion.button
				type="button"
				className="deploy-history-refresh"
				whileTap={{ scale: 0.96 }}
				onClick={() => void deploymentHistoryService.refresh(token)}
				disabled={loading}>
				<RefreshCw size={14} className={loading ? 'spin' : ''} />
				Refresh
			</motion.button>
		</div>
	);
}
