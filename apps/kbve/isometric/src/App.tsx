import { HUD } from './components/HUD';
import { Inventory } from './components/Inventory';
import { FPSCounter } from './components/FPSCounter';
import { useObjectSelection } from './hooks/useObjectSelection';

function App() {
	useObjectSelection();

	return (
		<div className="fixed inset-0 pointer-events-none font-game text-white">
			<FPSCounter />
			<HUD />
			<Inventory />
		</div>
	);
}

export default App;
