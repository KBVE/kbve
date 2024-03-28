import { registerRootComponent } from 'expo';

import { ExpoRoot } from 'expo-router';
import 'expo-router/entry';
import BaseApp from './src/app/_layout';



// The ExpoRoot component requires a React element, not a component class or function directly.
// Therefore, we create a simple wrapper component that returns BaseApp.
function AppWrapper() {
  return <BaseApp />;
}

// Pass the wrapper component to ExpoRoot.
// ExpoRoot will take care of rendering your application within the Expo environment,
// ensuring that routing and other setup is handled correctly.
//registerRootComponent();

//ExpoRoot(<AppWrapper />);

// 03-27-2024 Changes


export function App() {
   const ctx = require.context('./src/app');
   return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);


// Create a new component that renders ExpoRoot with AppWrapper.
// This component will be the entry point of your application.
// function RootComponent() {
//   return ExpoRoot(<AppWrapper />);
// }

// registerRootComponent(RootComponent);
