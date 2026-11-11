// electron-builder (M12): Windows NSIS (x64), macOS dmg (universal) and Linux AppImage.
// Everything the app runs is bundled by esbuild into dist/, so the installer carries no
// node_modules. The built web app goes into the asar as web/, without /heavy/ (those files are
// downloaded on demand from the configured server) and without source maps.
// Signing: unsigned unless certificates are supplied through electron-builder's environment
// variables (CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID...); never committed. See docs/DESKTOP.txt.

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'app.clearly.desktop',
  productName: 'Clearly',
  directories: { output: 'release', buildResources: 'resources' },
  asar: true,
  files: [
    'package.json',
    'dist/**/*.mjs',
    'dist/**/*.cjs',
    'static/**',
    { from: '../web/dist', to: 'web', filter: ['**/*', '!heavy/**', '!**/*.map'] },
  ],
  extraMetadata: { main: 'dist/main.mjs' },
  afterPack: './scripts/afterPack.cjs',
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
    category: 'public.app-category.utilities',
    icon: 'resources/icon.png',
    extendInfo: {
      NSMicrophoneUsageDescription:
        'Clearly listens to the virtual cable you choose (or the room, for Auto Boost). Nothing is recorded or sent anywhere.',
    },
  },
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'resources/icon.png' },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    category: 'AudioVideo',
    icon: 'resources/icon.png',
  },
};
