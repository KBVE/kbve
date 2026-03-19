import { Sidebar } from './components/Sidebar';
import { ViewHost } from './engine';
import { Slot } from './engine';
import { useAppStore } from './stores/app';
import { getView } from './engine';

export default function App() {
	return (
		<div className="flex h-screen w-screen">
			<Sidebar />
			<main className="flex flex-1 flex-col overflow-hidden">
				<Header />
				<ViewHost />
			</main>
		</div>
	);
}

function Header() {
	return (
		<header
			className="flex items-center border-b px-8 py-6"
			style={{
				backgroundColor: 'var(--color-surface)',
				borderColor: 'var(--color-border)',
			}}>
			<Slot
				store={useAppStore}
				select={(s) => s.activeView}
				render={(id) => getView(id)?.label ?? id}
				tag="h1"
				className="font-display text-heading font-semibold"
			/>
		</header>
	);
}
