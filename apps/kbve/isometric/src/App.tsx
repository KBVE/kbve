import { HUD } from './components/HUD';
import { Inventory } from './components/Inventory';
import { FPSCounter } from './components/FPSCounter';
import { useInputBridge } from './hooks/useInputBridge';

function App() {
	useInputBridge();
	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				pointerEvents: 'none',
				fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
				color: '#fff',
			}}>
			<FPSCounter />
			<HUD />
			<Inventory />
		</div>
	);
}

export default App;
