import { ChatInput } from './components/ChatInput';
import { HUD } from './components/HUD';
import { ObjectLabel } from './components/ObjectLabel';
import { UsernameModal } from './components/UsernameModal';
import { useObjectSelection } from './hooks/useObjectSelection';

function App() {
	useObjectSelection();

	return (
		<div
			className="fixed inset-0 font-game text-text rpg-text-shadow"
			style={{ pointerEvents: 'none' }}>
			<HUD />
			<ObjectLabel />
			<UsernameModal />
			<ChatInput />
		</div>
	);
}

export default App;
