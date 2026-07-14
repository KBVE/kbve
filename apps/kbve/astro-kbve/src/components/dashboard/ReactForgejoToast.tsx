import { useStore } from '@nanostores/react';
import { forgejoService } from './forgejoService';
import { ForgejoToast } from './forgejoUi';

export default function ReactForgejoToast() {
	const toast = useStore(forgejoService.$toast);
	return (
		<ForgejoToast
			toast={toast}
			onClose={() => forgejoService.dismissToast()}
		/>
	);
}
