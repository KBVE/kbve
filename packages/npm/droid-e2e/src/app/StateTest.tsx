import { useStore } from '@nanostores/react';
import {
	$auth,
	setAuth,
	resetAuth,
	$currentPath,
	$activeTooltip,
	$drawerOpen,
	$modalId,
	openTooltip,
	closeTooltip,
	openDrawer,
	closeDrawer,
	openModal,
	closeModal,
} from '@kbve/droid';

export function StateTest() {
	const auth = useStore($auth);
	const currentPath = useStore($currentPath);
	const activeTooltip = useStore($activeTooltip);
	const drawerOpen = useStore($drawerOpen);
	const modalId = useStore($modalId);

	return (
		<div data-testid="state-test" style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
			<h2>State Management</h2>

			<section style={{ marginBottom: '1rem' }}>
				<h3>Auth State</h3>
				<div data-testid="auth-tone">{auth.tone}</div>
				<div data-testid="auth-name">{auth.name}</div>
				<div data-testid="auth-id">{auth.id}</div>
				<div data-testid="auth-error">{auth.error ?? ''}</div>
				<div style={{ display: 'flex', gap: '0.5rem' }}>
					<button
						data-testid="auth-set"
						onClick={() =>
							setAuth({
								tone: 'auth',
								name: 'Test User',
								id: 'user-123',
								avatar: undefined,
								error: undefined,
							})
						}
					>
						Set Auth
					</button>
					<button data-testid="auth-reset" onClick={resetAuth}>
						Reset Auth
					</button>
				</div>
			</section>

			<section style={{ marginBottom: '1rem' }}>
				<h3>Router State</h3>
				<div data-testid="router-path">{currentPath}</div>
			</section>

			<section style={{ marginBottom: '1rem' }}>
				<h3>Tooltip</h3>
				<div data-testid="tooltip-active">{activeTooltip ?? 'none'}</div>
				<div style={{ display: 'flex', gap: '0.5rem' }}>
					<button
						data-testid="tooltip-open-help"
						onClick={() => openTooltip('help')}
					>
						Open Help
					</button>
					<button
						data-testid="tooltip-open-info"
						onClick={() => openTooltip('info')}
					>
						Open Info
					</button>
					<button data-testid="tooltip-close" onClick={() => closeTooltip()}>
						Close
					</button>
				</div>
			</section>

			<section style={{ marginBottom: '1rem' }}>
				<h3>Drawer</h3>
				<div data-testid="drawer-state">{drawerOpen ? 'open' : 'closed'}</div>
				<div style={{ display: 'flex', gap: '0.5rem' }}>
					<button data-testid="drawer-open" onClick={openDrawer}>
						Open Drawer
					</button>
					<button data-testid="drawer-close" onClick={closeDrawer}>
						Close Drawer
					</button>
				</div>
			</section>

			<section>
				<h3>Modal</h3>
				<div data-testid="modal-id">{modalId ?? 'none'}</div>
				<div style={{ display: 'flex', gap: '0.5rem' }}>
					<button
						data-testid="modal-open-settings"
						onClick={() => openModal('settings')}
					>
						Open Settings
					</button>
					<button
						data-testid="modal-open-confirm"
						onClick={() => openModal('confirm')}
					>
						Open Confirm
					</button>
					<button data-testid="modal-close" onClick={() => closeModal()}>
						Close Modal
					</button>
				</div>
			</section>
		</div>
	);
}
