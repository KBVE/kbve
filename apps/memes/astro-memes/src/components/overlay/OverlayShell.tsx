import { ToastContainer, ModalOverlay, TooltipOverlay } from '@kbve/astro';

export function OverlayShell() {
	return (
		<>
			<ToastContainer position="bottom-right" maxVisible={5} />
			<ModalOverlay id="generic" title="Notice" />
			<TooltipOverlay id="react-tooltip" />
		</>
	);
}
