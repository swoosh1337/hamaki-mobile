const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure audio file types are included as assets
// This helps with bundling .mp3 files from non-standard locations
const additionalAssetExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];

config.resolver.assetExts = [
  ...config.resolver.assetExts.filter((ext) => !additionalAssetExts.includes(ext)),
  ...additionalAssetExts,
];

module.exports = config;
