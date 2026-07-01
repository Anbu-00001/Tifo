import { registerRootComponent } from "expo";
import App from "./App";

// Entry point — registers the React root. The heavy QVAC engines run inside a
// Bare worklet (react-native-bare-kit) that the @qvac/sdk expo-plugin bundles
// during `npx expo prebuild`; nothing here starts it manually.
registerRootComponent(App);
