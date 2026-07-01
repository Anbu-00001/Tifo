import React, { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { C, F } from "../theme";
import { cfg } from "../config";
import type { Screen } from "../../App";
import { askCompanion } from "../qvac/companion";
import { playWav } from "../audio/io";

const EXAMPLES = cfg.sample.exampleQuestions ?? [];

type Turn = {
  q: string; answer: string; grounded: boolean | null;
  sources: { topic: string; score: number }[]; translated?: string; spoke: boolean; done: boolean;
};

export default function AskScreen({ nav }: { nav: (s: Screen) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [target, setTarget] = useState(cfg.lang.source);
  const [status, setStatus] = useState("");
  const busy = useRef(false);
  const answerLangs = [cfg.lang.source, ...cfg.ui.languages.map((l) => l.code)];

  function patch(i: number, p: Partial<Turn>) { setTurns((t) => t.map((x, j) => (j === i ? { ...x, ...p } : x))); }

  async function ask(q: string) {
    if (busy.current || !q.trim()) return;
    busy.current = true; setText("");
    const idx = turns.length;
    setTurns((t) => [...t, { q, answer: "", grounded: null, sources: [], spoke: false, done: false }]);
    try {
      for await (const ev of askCompanion({ question: q, target, speak: true })) {
        if (ev.type === "status") setStatus(ev.msg);
        else if (ev.type === "sources") patch(idx, { sources: ev.sources, grounded: ev.grounded });
        else if (ev.type === "token") setTurns((t) => t.map((x, j) => (j === idx ? { ...x, answer: x.answer + ev.token } : x)));
        else if (ev.type === "answer") patch(idx, { answer: ev.text, grounded: ev.grounded });
        else if (ev.type === "translated") patch(idx, { translated: ev.text });
        else if (ev.type === "audio") { patch(idx, { spoke: true }); playWav(ev.wav).catch(() => {}); }
        else if (ev.type === "done") { patch(idx, { done: true }); setStatus(`Answered on-device in ${(ev.latMs / 1000).toFixed(1)}s.`); }
      }
    } catch (e) { patch(idx, { answer: `error: ${(e as Error)?.message ?? e}`, done: true }); }
    busy.current = false;
  }

  const topScore = (t: Turn) => (t.sources[0]?.score ?? 0).toFixed(2);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.wrap}>
        <View style={s.nav}>
          <Pressable onPress={() => nav("home")}><Text style={s.back}>‹</Text></Pressable>
          <Text style={s.navT}>Ask the companion</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 22 }}>
          {turns.length === 0 && (
            <View style={s.empty}>
              <View style={s.emptyIc}><Text style={{ fontSize: 34 }}>⚽</Text></View>
              <Text style={s.emptyT}>Ask anything about the rules of football</Text>
              <Text style={s.emptyS}>Answers come from an offline knowledge pack — grounded, cited, and honest when it doesn’t know.</Text>
              <Text style={[s.label, { marginTop: 22 }]}>TRY ONE</Text>
              {EXAMPLES.map((e) => (
                <Pressable key={e} style={s.ex} onPress={() => ask(e)}><Text style={s.exT}>{e}</Text></Pressable>
              ))}
            </View>
          )}

          {turns.map((t, i) => (
            <View key={i}>
              <View style={s.bubble}><Text style={s.bubbleT}>{t.q}</Text></View>
              {(t.grounded !== null || t.answer !== "") && (
                <View style={[s.answer, t.grounded === false && s.refused]}>
                  {t.grounded !== null && (
                    <View style={[s.pill, t.grounded === false && s.pillRefused]}>
                      <Text style={[s.pillT, t.grounded === false && s.pillTRefused]}>
                        {t.grounded ? "✓ GROUNDED IN PACK" : "⚠ NOT IN PACK — NOT GUESSING"}
                      </Text>
                    </View>
                  )}
                  <Text style={s.atext}>{t.answer}</Text>
                  {t.translated ? <Text style={s.translated}>🔊 {t.translated}</Text> : null}
                  {t.spoke && <View style={s.speak}><Text style={s.speakT}>▶ spoken on-device · {target.toUpperCase()}</Text></View>}
                  {t.sources.length > 0 && (
                    <>
                      <Text style={s.srcLabel}>SOURCES — ON-DEVICE PACK</Text>
                      <View style={s.srcChips}>
                        {t.sources.slice(0, 3).map((sc, k) => (
                          <View key={k} style={s.srcChip}><Text style={s.srcChipT}>📄 {sc.topic} · {sc.score}</Text></View>
                        ))}
                      </View>
                    </>
                  )}
                  {t.grounded === false && t.done && (
                    <Text style={s.refnote}>top match score {topScore(t)} {"<"} threshold {cfg.rag.minScore} → refused</Text>
                  )}
                </View>
              )}
            </View>
          ))}
          {status ? <Text style={s.status}>{status}</Text> : null}
        </ScrollView>

        <View style={s.composer}>
          <View style={s.langRow}>
            {answerLangs.map((code) => (
              <Pressable key={code} onPress={() => setTarget(code)} style={[s.langChip, target === code && s.langChipSel]}>
                <Text style={[s.langChipT, target === code && s.langChipTSel]}>🔊 {code.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.inputBar}>
            <TextInput
              style={s.input} placeholder="Ask a question…" placeholderTextColor="#6c7a74"
              value={text} onChangeText={setText} onSubmitEditing={() => ask(text)} returnKeyType="send"
            />
            <Pressable style={s.send} onPress={() => ask(text)}><Text style={s.sendT}>↑</Text></Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 48 },
  nav: { flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 22, paddingBottom: 4 },
  back: { color: C.mut, fontSize: 26 },
  navT: { color: C.fg, fontFamily: F.sansBold, fontSize: 19 },
  empty: { alignItems: "center" },
  emptyIc: { width: 74, height: 74, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  emptyT: { color: C.fg, fontFamily: F.sansBold, fontSize: 23, textAlign: "center" },
  emptyS: { color: C.mut, fontFamily: F.sans, fontSize: 14, textAlign: "center", marginTop: 10, maxWidth: 270 },
  label: { color: C.mut2, fontFamily: F.mono, fontSize: 11, letterSpacing: 1, alignSelf: "flex-start" },
  ex: { padding: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginTop: 10, width: "100%" },
  exT: { color: "#cfe0d9", fontFamily: F.sans, fontSize: 15 },
  bubble: { alignSelf: "flex-end", maxWidth: "84%", backgroundColor: "rgba(35,209,139,0.14)", borderWidth: 1, borderColor: "rgba(35,209,139,0.3)", borderRadius: 18, borderBottomRightRadius: 4, padding: 12, marginTop: 16 },
  bubbleT: { color: "#dcf3e9", fontFamily: F.sans, fontSize: 15, fontWeight: "600" },
  answer: { marginTop: 18, backgroundColor: C.panel1, borderWidth: 1, borderColor: "#23302a", borderLeftWidth: 3, borderLeftColor: C.accent, borderRadius: 18, padding: 16 },
  refused: { backgroundColor: "#1a140c", borderColor: "#3a2e18", borderLeftColor: C.amber },
  pill: { alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: "rgba(35,209,139,0.14)", borderWidth: 1, borderColor: "rgba(35,209,139,0.4)", marginBottom: 13 },
  pillRefused: { backgroundColor: "rgba(231,178,76,0.14)", borderColor: "rgba(231,178,76,0.4)" },
  pillT: { color: C.accent, fontFamily: F.mono, fontSize: 11, fontWeight: "700" },
  pillTRefused: { color: C.amber },
  atext: { color: C.fg, fontFamily: F.sans, fontSize: 16.5, lineHeight: 25 },
  translated: { color: "#fff", fontFamily: F.sans, fontSize: 16.5, lineHeight: 25, marginTop: 10 },
  speak: { marginTop: 14, alignSelf: "flex-start", paddingVertical: 9, paddingHorizontal: 13, borderRadius: 14, backgroundColor: "rgba(35,209,139,0.1)", borderWidth: 1, borderColor: "rgba(35,209,139,0.35)" },
  speakT: { color: C.accent, fontFamily: F.mono, fontSize: 12 },
  srcLabel: { color: C.mut2, fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  srcChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  srcChip: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  srcChipT: { color: "#cfe0d9", fontFamily: F.sans, fontSize: 12 },
  refnote: { marginTop: 14, color: "#9a8a5e", fontFamily: F.mono, fontSize: 11, backgroundColor: "rgba(231,178,76,0.06)", borderWidth: 1, borderColor: "rgba(231,178,76,0.2)", borderRadius: 10, padding: 10 },
  status: { color: C.mut, fontFamily: F.sans, fontSize: 13, marginTop: 14 },
  composer: { padding: 16 },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  langChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  langChipSel: { backgroundColor: "rgba(35,209,139,0.16)", borderColor: C.accent },
  langChipT: { color: "#cfe0d9", fontFamily: F.mono, fontSize: 12 },
  langChipTSel: { color: C.fg },
  inputBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 18, paddingLeft: 18, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, color: C.fg, fontFamily: F.sans, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(35,209,139,0.18)", borderWidth: 1, borderColor: "rgba(35,209,139,0.35)", alignItems: "center", justifyContent: "center" },
  sendT: { color: C.accent, fontSize: 18 },
});
