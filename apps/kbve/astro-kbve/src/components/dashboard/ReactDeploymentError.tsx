import { useStore } from '@nanostores/react';
import { deploymentHistoryService } from './deploymentHistoryService';

export default function ReactDeploymentError() {
	const error = useStore(deploymentHistoryService.$error);
	if (!error) return null;
	return <div className="deploy-history-error">{error}</div>;
}
