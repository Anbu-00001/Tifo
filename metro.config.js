// Metro config — allow bundling .wav assets (the demo commentary clip + any TTS
// fixtures) so `require("../assets/commentary_en.wav")` resolves.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes("wav")) config.resolver.assetExts.push("wav");
module.exports = config;
