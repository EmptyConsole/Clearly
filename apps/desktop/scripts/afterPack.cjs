// Electron Fuses (M12), flipped on the packaged binary before signing: no running as Node, no
// NODE_OPTIONS, no --inspect arguments, encrypted cookies, the app loads only from its asar, and
// file:// pages get no extra privileges.
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const name = context.packager.appInfo.productFilename;
  const platform = context.electronPlatformName;
  const exe =
    platform === 'darwin'
      ? path.join(context.appOutDir, `${name}.app`)
      : platform === 'win32'
        ? path.join(context.appOutDir, `${name}.exe`)
        : path.join(context.appOutDir, context.packager.executableName);
  await flipFuses(exe, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: platform === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // Clearly never loads file:// pages, so they get no extra privileges.
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};
