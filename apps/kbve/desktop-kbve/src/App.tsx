import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ViewHost } from './engine';
import { Slot } from './engine';
import { useAppStore } from './stores/app';
import { getView } from './engine';
import { useAuthStore } from './stores/auth';
import { SignIn } from './components/SignIn';
import { ToastContainer } from './components/common/ToastContainer';

export default function App() {
	const phase = useAuthStore((s) => s.phase);
	const ready = useAuthStore((s) => s.ready);

	useEffect(() => {
		void useAuthStore.getState().init();
	}, []);

	// Hold the shell back until a stored session has had its chance to restore,
	// otherwise a signed-in user flashes the sign-in screen on every launch.
	if (!ready) return <div className="h-screen w-screen" />;
	if (phase !== 'authed') return <SignIn />;

	return (
		<div className="flex h-screen w-screen">
			<Sidebar />
			<main
				className="flex min-w-0 flex-1 flex-col overflow-hidden"
				style={{ backgroundColor: 'var(--color-bg)' }}>
				<Header />
				<ViewHost />
			</main>
			<ToastContainer />
		</div>
	);
}

function Header() {
	return (
		<header
			className="flex flex-shrink-0 items-center px-10 pt-8 pb-2"
			style={{ backgroundColor: 'var(--color-bg)' }}>
			<Slot
				store={useAppStore}
				select={(s) => s.activeView}
				render={(id) => getView(id)?.label ?? id}
				tag="h1"
				className="font-display text-title font-semibold"
			/>
		</header>
	);
}
