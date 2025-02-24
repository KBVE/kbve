
import { ExpoRoot } from "expo-router";
import { AppRegistry } from "react-native";
import { name as appName } from "./app.json";
import 'expo-router/entry';

// Must be exported or Fast Refresh won't update the context
export function App() {
  const ctx = require.context("./src/app");
  return <ExpoRoot context={ctx} />;
}

AppRegistry.registerComponent(appName, () => App);