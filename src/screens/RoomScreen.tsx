import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, FlatList, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import * as Device from "expo-device";
import { C, F } from "../theme";
import { cfg, type Lang } from "../config";
import type { Screen } from "../../App";
import { joinRoom, type Room, type RoomEvent } from "../mesh/room";
import { translateForRoom, isRoomLang, unloadRoomNmt } from "../qvac/roomTranslate";

type MsgState = "plain" | "translating" | "translated" | "untranslatable" | "failed";
type Msg = { id: string; name: string; lang: string; text: string; orig: string; ts: number; self: boolean; state: MsgState; viaPivot?: boolean };

// User-pickable room languages: the source/hub language + every configured
// language the shipped NMT models can actually reach both ways.
const ROOM_LANGS: Lang[] = [
  { code: cfg.lang.source, label: cfg.ui.sourceLabel, flag: cfg.ui.sourceFlag },
  ...cfg.ui.languages,
].filter((l) => isRoomLang(l.code));

export default function RoomScreen({ nav }: { nav: (s: Screen) => void }) {
  const [myLang, setMyLang] = useState<string | null>(null);
  const [status, setStatus] = useState("Joining the room…");
  const [peers, setPeers] = useState(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const room = useRef<Room | null>(null);
  const list = useRef<FlatList<Msg>>(null);
  const rtl = cfg.ui.languages.find((l) => l.code === myLang)?.rtl === true;

  function patchMsg(id: string, patch: Partial<Msg>) {
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function onIncoming(e: Extract<RoomEvent, { ev: "msg" }>, lang: string) {
    const id = `${e.key}-${e.id}-${e.ts}`;
    const needs = e.lang.toLowerCase() !== lang.toLowerCase();
    setMsgs((m) => [...m, {
      id, name: e.name, lang: e.lang, text: e.text, orig: e.text, ts: e.ts, self: false,
      state: needs ? "translating" : "plain",
    }]);
    if (!needs) return;
    translateForRoom(e.text, e.lang, lang)
      .then((r) => {
        if (r === null) patchMsg(id, { state: "untranslatable" });
        else patchMsg(id, { text: r.text, state: "translated", viaPivot: r.route.length > 1 });
      })
      .catch(() => patchMsg(id, { state: "failed" }));
  }

  function join(lang: string) {
    setMyLang(lang);
    const name = Device.modelName ?? "Phone";
    room.current = joinRoom({ name, lang }, (e: RoomEvent) => {
      switch (e.ev) {
        case "ready": setStatus(`In room as ${e.name} — finding peers…`); break;
        case "announced": setStatus((s) => (s.includes("in room") ? s : "On the DHT — waiting for fans…")); break;
        case "peer": setPeers(e.peers); setStatus(`${e.peers + 1} in room`); break;
        case "peer-gone": setPeers(e.peers); setStatus(`${e.peers + 1} in room`); break;
        case "msg": onIncoming(e, lang); break;
        case "sent":
          setMsgs((m) => [...m, { id: `me-${e.id}-${e.ts}`, name: e.name, lang: e.lang, text: e.text, orig: e.text, ts: e.ts, self: true, state: "plain" }]);
          break;
        case "err": setStatus(`error: ${e.msg}`); break;
        default: break;
      }
    });
  }

  useEffect(() => () => {
    room.current?.leave();
    room.current = null;
    void unloadRoomNmt().catch(() => {});
  }, []);

  function send() {
    const t = input.trim();
    if (!t || !room.current) return;
    room.current.send(t);
    setInput("");
  }

  const flagOf = (code: string) => ROOM_LANGS.find((l) => l.code === code)?.flag ?? code.toUpperCase();

  function meta(m: Msg): string {
    const who = m.self ? "you" : m.name;
    switch (m.state) {
      case "translating": return `${who} · ${m.lang} → ${myLang} · translating…`;
      case "translated": return `${who} · ${m.lang} → ${myLang}${m.viaPivot ? " · via " + (cfg.models.nmt.pivot ?? "en") : ""} · on-device`;
      case "untranslatable": return `${who} · ${m.lang} · no offline model for this pair`;
      case "failed": return `${who} · ${m.lang} · translation failed — original shown`;
      default: return `${who} · ${m.lang}`;
    }
  }

  // ---- phase 1: pick your language -----------------------------------------
  if (myLang === null) {
    return (
      <View style={s.wrap}>
        <View style={s.nav}>
          <Pressable onPress={() => nav("home")}><Text style={s.back}>‹</Text></Pressable>
          <Text style={s.navT}>Fan room</Text>
          <View style={s.badge}><View style={s.dot} /><Text style={s.badgeT}>P2P · no server</Text></View>
        </View>
        <Text style={s.label}>YOUR LANGUAGE</Text>
        <Text style={s.hint}>Everyone writes in their own language — your phone translates the room for you, on-device.</Text>
        <View style={s.chips}>
          {ROOM_LANGS.map((l) => (
            <Pressable key={l.code} onPress={() => join(l.code)} style={s.chip}>
              <Text style={s.chipT}>{l.flag} {l.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // ---- phase 2: in the room --------------------------------------------------
  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.nav}>
        <Pressable onPress={() => nav("home")}><Text style={s.back}>‹</Text></Pressable>
        <Text style={s.navT}>Fan room</Text>
        <View style={s.badge}><View style={s.dot} /><Text style={s.badgeT}>{flagOf(myLang)} {myLang.toUpperCase()} · P2P</Text></View>
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
            <Text style={s.meta}>{meta(item)}</Text>
            <Text style={[s.text, !item.self && rtl && s.rtl]}>{item.text}</Text>
            {item.state === "translated" && item.orig !== item.text && (
              <Text style={s.orig}>{item.orig}</Text>
            )}
          </View>
        )}
      />

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
          placeholder={`Write in ${ROOM_LANGS.find((l) => l.code === myLang)?.label ?? myLang}…`}
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
  label: { marginTop: 26, color: C.mut2, fontFamily: F.mono, fontSize: 12, letterSpacing: 2 },
  hint: { marginTop: 8, color: C.mut, fontFamily: F.sans, fontSize: 14, lineHeight: 20 },
  chips: { marginTop: 18, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(255,255,255,0.04)" },
  chipT: { color: C.fg, fontFamily: F.sans, fontSize: 15 },
  bubble: { maxWidth: "82%", padding: 12, borderRadius: 14, marginTop: 8 },
  mine: { alignSelf: "flex-end", backgroundColor: "rgba(35,209,139,0.14)", borderWidth: 1, borderColor: "rgba(35,209,139,0.3)" },
  theirs: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  meta: { color: C.mut2, fontFamily: F.mono, fontSize: 10, marginBottom: 3 },
  text: { color: C.fg, fontFamily: F.sans, fontSize: 16 },
  rtl: { textAlign: "right", writingDirection: "rtl" },
  orig: { color: C.mut2, fontFamily: F.sans, fontSize: 12, marginTop: 5, fontStyle: "italic" },
  // Extra bottom padding keeps the send row clear of the Android gesture/nav
  // bar (no safe-area dependency yet; revisit on the UX pass).
  inputRow: { flexDirection: "row", gap: 10, paddingTop: 12, paddingBottom: 44, alignItems: "center" },
  input: { flex: 1, color: C.fg, fontFamily: F.sans, fontSize: 15, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(255,255,255,0.04)" },
  sendBtn: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 14, backgroundColor: C.accent },
  sendT: { color: "#04140d", fontFamily: F.sansBold, fontSize: 15 },
});
