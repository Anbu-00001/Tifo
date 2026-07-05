import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C, F } from "../theme";
import { MaterialIcons } from "@expo/vector-icons";
import type { Screen } from "../../App";

export default function HomeScreen({ nav }: { nav: (s: Screen) => void }) {
  return (
    <View style={s.wrap}>
      <View style={s.logo}><Text style={s.logoT}>T</Text></View>
      <Text style={s.title}>TIFO</Text>
      <Text style={s.tag}>your offline matchday companion</Text>

      <View style={s.trust}>
        <View style={s.dot} />
        <View>
          <Text style={s.trustT}>0 servers · 100% on-device</Text>
          <Text style={s.trustS}>AI runs on your phone · chat is peer-to-peer</Text>
        </View>
      </View>

      <Pressable style={[s.feature, s.primary]} onPress={() => nav("room")}>
        <View style={[s.ic, s.icPrimary]}><Text style={s.icT}>🌍</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.fT}>Fan room</Text>
          <Text style={s.fS}>Chat across languages — your phone translates</Text>
        </View>
        <Text style={[s.chev, { color: C.accent }]}>›</Text>
      </Pressable>

      <Pressable style={s.feature} onPress={() => nav("live")}>
        <View style={s.ic}><MaterialIcons name="mic" size={24} color={C.mut} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.fT}>Live translation</Text>
          <Text style={s.fS}>Hear the match in your language</Text>
        </View>
        <Text style={s.chev}>›</Text>
      </Pressable>

      <Text style={s.foot}>AI YOU OWN, THAT WORKS ANYWHERE</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 64, paddingHorizontal: 30 },
  logo: { width: 54, height: 54, borderRadius: 16, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  logoT: { color: "#04140d", fontFamily: F.sansBold, fontSize: 28, fontWeight: "900" },
  title: { marginTop: 20, color: C.fg, fontFamily: F.sansBold, fontSize: 58, letterSpacing: 6 },
  tag: { marginTop: 10, color: C.mut, fontFamily: F.sans, fontSize: 17 },
  trust: { marginTop: 26, marginBottom: 30, flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "flex-start", paddingVertical: 13, paddingHorizontal: 17, borderRadius: 16, backgroundColor: "rgba(35,209,139,0.09)", borderWidth: 1, borderColor: "rgba(35,209,139,0.4)" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  trustT: { color: C.accent, fontFamily: F.mono, fontSize: 13, fontWeight: "700" },
  trustS: { color: C.mut2, fontSize: 11, marginTop: 2, fontFamily: F.sans },
  feature: { padding: 22, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 17, marginBottom: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", backgroundColor: "rgba(255,255,255,0.04)" },
  primary: { backgroundColor: "rgba(35,209,139,0.12)", borderColor: "rgba(35,209,139,0.32)" },
  ic: { width: 54, height: 54, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  icPrimary: { backgroundColor: "rgba(35,209,139,0.18)" },
  icT: { fontSize: 24 },
  fT: { color: C.fg, fontFamily: F.sansBold, fontSize: 20 },
  fS: { color: C.mut, fontFamily: F.sans, fontSize: 14, marginTop: 3 },
  chev: { color: C.mut2, fontSize: 22, fontWeight: "800" },
  foot: { marginTop: "auto", marginBottom: 30, textAlign: "center", color: "#5f6f69", fontFamily: F.mono, fontSize: 11, letterSpacing: 2 },
});
