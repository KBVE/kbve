import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import 'expo-router/entry';
import BaseApp from './src/app/_layout';



export default function App() {
  const ctx = require.context('./src/app');
  return <ExpoRoot context={ctx} />;
}

// export function App() {
//   const ctx = require.context('./src/app');
//   return <ExpoRoot context={ctx} />;
// }

//registerRootComponent(App);