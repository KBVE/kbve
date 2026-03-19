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
			className="flex items-center border-b px-6 py-4"
			style={{
				backgroundColor: 'var(--color-surface)',
				borderColor: 'var(--color-border)',
			}}>
			<Slot
				store={useAppStore}
				select={(s) => s.activeView}
				render={(id) => getView(id)?.label ?? id}
				tag="h1"
				className="text-lg font-semibold"
			/>
		</header>
	);
}
