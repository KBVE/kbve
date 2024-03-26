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
ExpoRoot(<AppWrapper />);