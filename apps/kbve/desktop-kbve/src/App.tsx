import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ContentArea } from './components/ContentArea';

export type Page = 'general' | 'audio' | 'models' | 'shortcuts' | 'about';

export default function App() {
	const [currentPage, setCurrentPage] = useState<Page>('general');
	const [sidebarOpen, setSidebarOpen] = useState(true);

	return (
		<div className="flex h-screen w-screen">
			<Sidebar
				currentPage={currentPage}
				onNavigate={setCurrentPage}
				isOpen={sidebarOpen}
				onToggle={() => setSidebarOpen(!sidebarOpen)}
			/>
			<ContentArea currentPage={currentPage} sidebarOpen={sidebarOpen} />
		</div>
	);
}
