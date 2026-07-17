import { NavBar } from '@kbve/rn-astro';

export default function ReactNavBarStrip() {
	return (
		<NavBar
			onNavigate={(href) => {
				window.location.href = href;
			}}
		/>
	);
}
