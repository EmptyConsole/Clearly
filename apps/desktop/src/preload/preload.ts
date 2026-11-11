// The main window's preload (M12), bundled into one CommonJS file because sandboxed preloads
// cannot require npm packages. It exposes window.clearlyDesktop: only the allowlisted channels, and
// every request is validated with the shared zod schemas before it leaves (the main process
// validates again, and checks the sender's origin).

import {
  DESKTOP_CHANNELS,
  TRAY_COMMAND_EVENT,
  TrayCommand,
  ipcName,
  type ClearlyDesktopBridge,
  type DesktopChannel,
} from '@clearly/core/desktop';
import { contextBridge, ipcRenderer } from 'electron';

async function call(channel: DesktopChannel, payload: unknown = {}): Promise<unknown> {
  const schema = DESKTOP_CHANNELS[channel];
  const req = schema.request.safeParse(payload);
  if (!req.success) throw new TypeError(`Clearly: invalid ${channel} request`);
  const reply: unknown = await ipcRenderer.invoke(ipcName(channel), req.data);
  return schema.reply.parse(reply);
}

const bridge: ClearlyDesktopBridge = {
  platform: 'desktop',
  getVersion: () => call('getVersion') as ReturnType<ClearlyDesktopBridge['getVersion']>,
  saveFile: (r) => call('saveFile', r) as ReturnType<ClearlyDesktopBridge['saveFile']>,
  openFile: (r) => call('openFile', r) as ReturnType<ClearlyDesktopBridge['openFile']>,
  showFloatingCaptions: () => call('showFloatingCaptions') as Promise<null>,
  updateCaptionText: (r) => call('updateCaptionText', r) as Promise<null>,
  hideFloatingCaptions: () => call('hideFloatingCaptions') as Promise<null>,
  setTrayState: (r) => call('setTrayState', r) as Promise<null>,
  onTrayCommand(cb) {
    const listener = (_e: unknown, command: unknown) => {
      const c = TrayCommand.safeParse(command);
      if (c.success) cb(c.data);
    };
    ipcRenderer.on(TRAY_COMMAND_EVENT, listener);
    return () => {
      ipcRenderer.removeListener(TRAY_COMMAND_EVENT, listener);
    };
  },
  writeBackup: (r) => call('writeBackup', r) as Promise<null>,
  revealBackup: () => call('revealBackup') as Promise<null>,
  getLoopbackSupport: () =>
    call('getLoopbackSupport') as ReturnType<ClearlyDesktopBridge['getLoopbackSupport']>,
  setGlobalShortcut: (r) =>
    call('setGlobalShortcut', r) as ReturnType<ClearlyDesktopBridge['setGlobalShortcut']>,
};

contextBridge.exposeInMainWorld('clearlyDesktop', bridge);
