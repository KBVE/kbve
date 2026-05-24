import { ChatInput } from './components/ChatInput';
import { HUD } from './components/HUD';
import { FPSCounter } from './components/FPSCounter';
import { ObjectLabel } from './components/ObjectLabel';
import { UsernameModal } from './components/UsernameModal';
import { useObjectSelection } from './hooks/useObjectSelection';

function App() {
	useObjectSelection();

	return (
		<div
			className="fixed inset-0 font-game text-text rpg-text-shadow"
			style={{ pointerEvents: 'none' }}>
			<div
				style={{
					position: 'fixed',
					top: 40,
					right: 8,
					zIndex: 99999,
					padding: '2px 6px',
					background: '#ff00ff',
					color: '#fff',
					fontSize: 10,
					fontFamily: 'monospace',
					pointerEvents: 'none',
				}}>
				REACT-OK
			</div>
			<FPSCounter />
			<HUD />
			<ObjectLabel />
			<UsernameModal />
			<ChatInput />
		</div>
	);
}

export default App;
