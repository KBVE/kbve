import { ExpoRoot } from "expo-router";
import 'expo-router/entry';
const App = () => {
  const ctx = require.context("./src/app");
  return <ExpoRoot context={ctx} />;
}
export default App;