import React, { useState } from "react";
import { View, StatusBar } from "react-native";
import { useFonts } from "expo-font";
import { Archivo_400Regular, Archivo_700Bold, Archivo_900Black } from "@expo-google-fonts/archivo";
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { C } from "./src/theme";
import HomeScreen from "./src/screens/HomeScreen";
import LiveScreen from "./src/screens/LiveScreen";
import AskScreen from "./src/screens/AskScreen";

export type Screen = "home" | "live" | "ask";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [fontsLoaded] = useFonts({
    Archivo: Archivo_400Regular, "Archivo-Bold": Archivo_700Bold, "Archivo-Black": Archivo_900Black,
    JetBrainsMono: JetBrainsMono_500Medium, "JetBrainsMono-Bold": JetBrainsMono_700Bold,
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" />
      {fontsLoaded && screen === "home" && <HomeScreen nav={setScreen} />}
      {fontsLoaded && screen === "live" && <LiveScreen nav={setScreen} />}
      {fontsLoaded && screen === "ask" && <AskScreen nav={setScreen} />}
    </View>
  );
}
