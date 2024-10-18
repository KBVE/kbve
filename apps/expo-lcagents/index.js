import { ExpoRoot } from 'expo-router';
import 'expo-router/entry';
import { PortalProvider } from '@tamagui/portal';



export default function App() {
  const ctx = require.context('./src/app');

  return (
    <PortalProvider shouldAddRootHost>
      <ExpoRoot context={ctx} />
    </PortalProvider>
  );
}