import React, { useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { C, F } from "../theme";
import { cfg } from "../config";
import type { Screen } from "../../App";
import { liveTranslate } from "../qvac/liveTranslate";
import { bundledClipSource } from "../audio/source";
import { playWav } from "../audio/io";

// Bundled demo commentary (EN). Metro serves .wav via metro.config.js assetExts.
const DEMO_CLIP = require("../../assets/commentary_en.wav");

type Utt = { src: string; tgt: string; latMs: number; rtl: boolean };
type Phase = "idle" | "warming" | "live";

export default function LiveScreen({ nav }: { nav: (s: Screen) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [target, setTarget] = useState(cfg.ui.languages[0].code);
  const [status, setStatus] = useState("Pick a language and go live.");
  const [utts, setUtts] = useState<Utt[]>([]);
  const cancel = useRef(false);
  const rtlSet = new Set(cfg.ui.languages.filter((l) => l.rtl).map((l) => l.code));

  async function goLive() {
    cancel.current = false;
    setUtts([]); setPhase("warming"); setStatus("Loading on-device models…");
    try {
      for await (const ev of liveTranslate({ target, audio: bundledClipSource(DEMO_CLIP) })) {
        if (cancel.current) break;
        if (ev.type === "status") { setStatus(ev.msg); if (ev.msg.startsWith("Live —")) setPhase("live"); }
        else if (ev.type === "utterance") {
          setPhase("live");
          setUtts((u) => [...u, { src: ev.src, tgt: ev.tgt, latMs: ev.latMs, rtl: rtlSet.has(target) }]);
          playWav(ev.wav).catch(() => {});
        } else if (ev.type === "done") setStatus(`Done — ${ev.count} lines, avg ${ev.avgLatMs} ms on-device.`);
      }
    } catch (e) { setStatus(`error: ${(e as Error)?.message ?? e}`); }
    setPhase("idle");
  }
  function stop() { cancel.current = true; setPhase("idle"); }

  const flagOf = (code: string) => cfg.ui.languages.find((l) => l.code === code)?.flag ?? "";
  const pair = `${cfg.ui.sourceFlag} ${cfg.lang.source.toUpperCase()} → ${flagOf(target)} ${target.toUpperCase()}`;

  return (
    <View style={s.wrap}>
      <View style={s.nav}>
        <Pressable onPress={() => { stop(); nav("home"); }}><Text style={s.back}>‹</Text></Pressable>
        <Text style={s.navT}>Live translation</Text>
        {phase !== "idle" && <Text style={s.pair}>{pair}</Text>}
      </View>

      {phase === "idle" && (
        <View style={{ flex: 1 }}>
          <Text style={s.label}>YOUR LANGUAGE</Text>
          <View style={s.chips}>
            {cfg.ui.languages.map((l) => (
              <Pressable key={l.code} onPress={() => setTarget(l.code)} style={[s.chip, target === l.code && s.chipSel]}>
                <Text style={[s.chipT, target === l.code && s.chipTSel]}>{l.flag} {l.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.center}>
            <Pressable style={s.golive} onPress={goLive}>
              <MaterialIcons name="mic" size={34} color="#04140d" />
              <Text style={s.goliveT}>GO LIVE</Text>
            </Pressable>
            <Text style={s.hint}>Tap to translate the demo commentary</Text>
          </View>
        </View>
      )}

      {phase === "warming" && (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.blue} />
          <Text style={s.warmT}>Warming up models</Text>
          <Text style={s.warmS}>{status}</Text>
        </View>
      )}

      {phase === "live" && (
        <>
          <View style={s.liveHead}>
            <View style={s.liveTag}><View style={s.blip} /><Text style={s.liveTagT}>LIVE · LISTENING</Text></View>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ justifyContent: "flex-end", flexGrow: 1, paddingHorizontal: 24, paddingBottom: 12 }}>
            {utts.map((u, i) => {
              const latest = i === utts.length - 1;
              return (
                <View key={i} style={[s.utt, latest && s.uttLatest]}>
                  <Text style={s.uttO}>{u.src}</Text>
                  <Text style={[latest ? s.uttTBig : s.uttT, u.rtl && s.rtl]}>{u.tgt}</Text>
                  {latest && <Text style={s.latchip}>+{(u.latMs / 1000).toFixed(1)}s · on-device</Text>}
                </View>
              );
            })}
          </ScrollView>
          <View style={s.stopWrap}><Pressable style={s.stop} onPress={stop}><View style={s.stopSq} /></Pressable></View>
        </>
      )}
      <View style={s.badgeWrap}><View style={s.badge}><View style={s.bdot} /><Text style={s.badgeT}>0 KB sent · 100% on-device</Text></View></View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 48 },
  nav: { flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 22, paddingBottom: 8 },
  back: { color: C.mut, fontSize: 26 },
  navT: { color: C.fg, fontFamily: F.sansBold, fontSize: 19 },
  pair: { marginLeft: "auto", color: "#cfd8d4", fontFamily: F.mono, fontSize: 12 },
  label: { color: C.mut2, fontFamily: F.mono, fontSize: 11, letterSpacing: 1, paddingHorizontal: 24, marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 9, paddingHorizontal: 24 },
  chip: { paddingVertical: 11, paddingHorizontal: 15, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  chipSel: { backgroundColor: "rgba(35,209,139,0.16)", borderColor: C.accent },
  chipT: { color: "#cfe0d9", fontFamily: F.sans, fontSize: 15, fontWeight: "600" },
  chipTSel: { color: C.fg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  golive: { width: 156, height: 156, borderRadius: 78, alignItems: "center", justifyContent: "center", backgroundColor: C.accent },
  goliveT: { color: "#04140d", fontFamily: F.sansBold, fontSize: 19, letterSpacing: 1, marginTop: 4 },
  hint: { color: C.mut, fontFamily: F.sans, fontSize: 15 },
  warmT: { color: C.fg, fontFamily: F.sansBold, fontSize: 24, marginTop: 24 },
  warmS: { color: C.mut, fontFamily: F.sans, fontSize: 14, marginTop: 8, textAlign: "center", paddingHorizontal: 30 },
  liveHead: { paddingHorizontal: 24, paddingVertical: 8 },
  liveTag: { flexDirection: "row", alignItems: "center", gap: 9 },
  blip: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.red },
  liveTagT: { color: C.red, fontFamily: F.mono, fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  utt: { marginTop: 16 },
  uttLatest: { backgroundColor: C.panel1, borderWidth: 1, borderColor: "#23302a", borderLeftWidth: 3, borderLeftColor: C.accent, borderRadius: 16, padding: 15 },
  uttO: { color: C.mut2, fontFamily: F.sans, fontSize: 13, marginBottom: 3 },
  uttT: { color: C.fg, fontFamily: F.sansBold, fontSize: 21 },
  uttTBig: { color: "#fff", fontFamily: F.sansBold, fontSize: 27 },
  rtl: { textAlign: "right", writingDirection: "rtl" },
  latchip: { color: C.accent, fontFamily: F.mono, fontSize: 11, marginTop: 8 },
  stopWrap: { paddingVertical: 12, alignItems: "center" },
  stop: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(239,106,82,0.14)", borderWidth: 2, borderColor: "rgba(239,106,82,0.55)" },
  stopSq: { width: 20, height: 20, borderRadius: 5, backgroundColor: C.red },
  badgeWrap: { alignItems: "center", paddingVertical: 16 },
  badge: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: "rgba(35,209,139,0.08)", borderWidth: 1, borderColor: "rgba(35,209,139,0.32)" },
  bdot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  badgeT: { color: C.accent, fontFamily: F.mono, fontSize: 12, fontWeight: "600" },
});
