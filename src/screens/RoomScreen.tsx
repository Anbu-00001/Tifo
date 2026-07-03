import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, FlatList, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import * as Device from "expo-device";
import { C, F } from "../theme";
import { cfg } from "../config";
import type { Screen } from "../../App";
import { joinRoom, type Room, type RoomEvent } from "../mesh/room";

type Msg = { id: string; name: string; lang: string; text: string; ts: number; self: boolean };

export default function RoomScreen({ nav }: { nav: (s: Screen) => void }) {
  const [status, setStatus] = useState("Joining the room…");
  const [peers, setPeers] = useState(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const room = useRef<Room | null>(null);
  const list = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    const name = Device.modelName ?? "Phone";
    const r = joinRoom({ name, lang: cfg.lang.source }, (e: RoomEvent) => {
      switch (e.ev) {
        case "ready": setStatus(`In room as ${e.name} — finding peers…`); break;
        case "announced": setStatus((s) => s.includes("in room") ? s : "On the DHT — waiting for fans…"); break;
        case "peer": setPeers(e.peers); setStatus(`${e.peers + 1} in room`); break;
        case "peer-gone": setPeers(e.peers); setStatus(`${e.peers + 1} in room`); break;
        case "msg":
          setMsgs((m) => [...m, { id: `${e.key}-${e.id}-${e.ts}`, name: e.name, lang: e.lang, text: e.text, ts: e.ts, self: false }]);
          break;
        case "sent":
          setMsgs((m) => [...m, { id: `me-${e.id}-${e.ts}`, name: e.name, lang: e.lang, text: e.text, ts: e.ts, self: true }]);
          break;
        case "err": setStatus(`error: ${e.msg}`); break;
        default: break;
      }
    });
    room.current = r;
    return () => { r.leave(); room.current = null; };
  }, []);

  function send() {
    const t = input.trim();
    if (!t || !room.current) return;
    room.current.send(t);
    setInput("");
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.nav}>
        <Pressable onPress={() => nav("home")}><Text style={s.back}>‹</Text></Pressable>
        <Text style={s.navT}>Fan room</Text>
        <View style={s.badge}><View style={s.dot} /><Text style={s.badgeT}>P2P · no server</Text></View>
      </View>
      <Text style={s.status}>{status}{peers > 0 ? ` · ${peers} peer${peers === 1 ? "" : "s"} connected` : ""}</Text>

      <FlatList
        ref={list}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 10 }}
        data={msgs}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[s.bubble, item.self ? s.mine : s.theirs]}>
            <Text style={s.meta}>{item.self ? "you" : item.name} · {item.lang}</Text>
            <Text style={s.text}>{item.text}</Text>
          </View>
        )}
      />

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
          placeholder="Say something to the room…"
          placeholderTextColor={C.mut2}
          returnKeyType="send"
        />
        <Pressable style={s.sendBtn} onPress={send}><Text style={s.sendT}>Send</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 54, paddingHorizontal: 18 },
  nav: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { color: C.mut, fontSize: 34, paddingHorizontal: 6, marginTop: -6 },
  navT: { color: C.fg, fontFamily: F.sansBold, fontSize: 22, flex: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(35,209,139,0.09)", borderWidth: 1, borderColor: "rgba(35,209,139,0.4)" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  badgeT: { color: C.accent, fontFamily: F.mono, fontSize: 10, fontWeight: "700" },
  status: { color: C.mut, fontFamily: F.mono, fontSize: 12, marginTop: 10 },
  bubble: { maxWidth: "82%", padding: 12, borderRadius: 14, marginTop: 8 },
  mine: { alignSelf: "flex-end", backgroundColor: "rgba(35,209,139,0.14)", borderWidth: 1, borderColor: "rgba(35,209,139,0.3)" },
  theirs: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  meta: { color: C.mut2, fontFamily: F.mono, fontSize: 10, marginBottom: 3 },
  text: { color: C.fg, fontFamily: F.sans, fontSize: 16 },
  // Extra bottom padding keeps the send row clear of the Android gesture/nav
  // bar (no safe-area dependency yet; revisit on the UX pass).
  inputRow: { flexDirection: "row", gap: 10, paddingTop: 12, paddingBottom: 44, alignItems: "center" },
  input: { flex: 1, color: C.fg, fontFamily: F.sans, fontSize: 15, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(255,255,255,0.04)" },
  sendBtn: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 14, backgroundColor: C.accent },
  sendT: { color: "#04140d", fontFamily: F.sansBold, fontSize: 15 },
});
