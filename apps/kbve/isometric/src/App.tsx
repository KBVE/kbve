import { HUD } from './components/HUD';
import { Inventory } from './components/Inventory';
import { FPSCounter } from './components/FPSCounter';
import { useInputBridge } from './hooks/useInputBridge';

function App() {
	useInputBridge();
	return (
		<div className="fixed inset-0 pointer-events-none font-game text-white">
			<FPSCounter />
			<HUD />
			<Inventory />
		</div>
	);
}

export default App;
