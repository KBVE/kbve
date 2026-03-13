import { HUD } from './components/HUD';
import { Inventory } from './components/Inventory';
import { FPSCounter } from './components/FPSCounter';
import { ObjectLabel } from './components/ObjectLabel';
import { GoOnlineButton } from './components/GoOnlineButton';
import { useObjectSelection } from './hooks/useObjectSelection';

function App() {
	useObjectSelection();

	return (
		<div className="fixed inset-0 pointer-events-none font-game text-text rpg-text-shadow">
			<FPSCounter />
			<HUD />
			<Inventory />
			<ObjectLabel />
			<GoOnlineButton />
		</div>
	);
}

export default App;
