// Clearly desktop (M12): the built web app on clearly://app in a locked-down window, plus what only
// a desktop app can do: system sound, native dialogs, a tray, a global shortcut, a floating
// captions window and an automatic backup file.

import {
  DEFAULT_SHORTCUT,
  DESKTOP_CHANNELS,
  DESKTOP_CHANNEL_NAMES,
  TRAY_COMMAND_EVENT,
  ipcName,
  type DesktopChannel,
  type TrayCommand,
} from '@clearly/core/desktop';
import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { z } from 'zod';
import { APP_HOST, APP_ORIGIN, APP_SCHEME, mimeFor, serveApp } from './appFiles.ts';
import { loopbackSupport } from './capture.ts';
import { CaptionsWindow } from './captionsWindow.ts';
import { DOWNLOAD_URL, SERVER_URL } from './config.ts';
import { debounce, readJson, writeAtomic } from './jsonFile.ts';
import {
  contentSecurityPolicy,
  isAllowedNavigation,
  isAppUrl,
  isExternalAllowed,
  isPermissionGranted,
} from './security.ts';
import { restoreState, type WindowState } from './windowState.ts';

// Must run before app.ready: without it IndexedDB, the Cache API, service workers and media
// seeking would not behave as on a normal https origin.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true,
      stream: true,
    },
  },
]);

/** The built web app: inside app.asar when packaged, apps/web/dist in development. */
const WEB_ROOT = app.isPackaged
  ? join(app.getAppPath(), 'web')
  : // Unpackaged runs may point at another build (the e2e smoke test uses a test-hooks build).
    (process.env['CLEARLY_WEB_ROOT'] ?? join(import.meta.dirname, '..', '..', 'web', 'dist'));
const STATIC_ROOT = app.isPackaged
  ? join(app.getAppPath(), 'static')
  : join(import.meta.dirname, '..', 'static');
const CSP = contentSecurityPolicy(SERVER_URL);
const userFile = (name: string) => join(app.getPath('userData'), name);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayMode: 'original' | 'enhanced' = 'enhanced';
let trayActive = false;
let shortcut: string | null = DEFAULT_SHORTCUT;
let shortcutRegistered = false;
const captions = new CaptionsWindow({
  origin: APP_ORIGIN,
  positionsFile: () => userFile('caption-positions.json'),
  preload: join(import.meta.dirname, 'captionsPreload.cjs'),
});

function sendTray(command: TrayCommand): void {
  mainWindow?.webContents.send(TRAY_COMMAND_EVENT, command);
}

// ---------------------------------------------------------------------------------------------
// clearly://app

async function handleApp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/__desktop/')) {
    // The floating captions page and its files (apps/desktop/static).
    const rel = url.pathname.slice('/__desktop/'.length);
    const inner = new Request(`${APP_ORIGIN}/${rel}`, request);
    return serveApp(STATIC_ROOT, inner, { csp: CSP });
  }
  if (url.pathname.startsWith('/heavy/')) {
    // Heavy assets are not in the installer. They come from the configured server, on demand,
    // after the same tap and checksum check as on the web.
    const local = await serveApp(WEB_ROOT, request, { csp: CSP });
    if (local.status !== 404) return local;
    if (!SERVER_URL) return new Response('No server configured for downloads', { status: 404 });
    return net.fetch(`${SERVER_URL}${url.pathname}`, { headers: request.headers });
  }
  return serveApp(WEB_ROOT, request, { csp: CSP });
}

// ---------------------------------------------------------------------------------------------
// The window

async function createMainWindow(): Promise<void> {
  const workAreas = screen.getAllDisplays().map((d) => d.workArea);
  const saved = restoreState(await readJson(userFile('window-state.json')), workAreas);
  const win = new BrowserWindow({
    width: saved?.bounds.width ?? 1280,
    height: saved?.bounds.height ?? 860,
    ...(saved ? { x: saved.bounds.x, y: saved.bounds.y } : {}),
    minWidth: 360,
    minHeight: 480,
    show: false,
    title: 'Clearly',
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: join(import.meta.dirname, 'preload.cjs'),
    },
  });
  mainWindow = win;
  if (saved?.maximized) win.maximize();
  win.once('ready-to-show', () => {
    win.show();
  });
  const saveState = () => {
    const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    void writeAtomic(userFile('window-state.json'), JSON.stringify(state));
  };
  win.on('close', saveState);
  win.on('closed', () => {
    mainWindow = null;
  });
  await win.loadURL(`${APP_ORIGIN}/`);
}

// ---------------------------------------------------------------------------------------------
// Navigation, new windows and permissions

function lockDown(): void {
  app.on('web-contents-created', (_event, contents) => {
    const guard = (event: { preventDefault: () => void }, url: string) => {
      if (isAllowedNavigation(url)) return;
      event.preventDefault();
      if (isExternalAllowed(url)) void shell.openExternal(url);
    };
    contents.on('will-navigate', guard);
    contents.on('will-redirect', guard);
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (isExternalAllowed(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}

/** Permissions and screen capture on the default session (only after app.ready). */
function lockDownSession(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const camera =
      permission === 'media' &&
      'mediaTypes' in details &&
      (details.mediaTypes ?? []).includes('video');
    callback(!camera && isPermissionGranted(permission, details.requestingUrl));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    isPermissionGranted(permission, requestingOrigin),
  );

  // System sound: getDisplayMedia gets the first screen (video is required; the renderer stops
  // it at once) with loopback audio where this OS supports it.
  ses.setDisplayMediaRequestHandler((request, callback) => {
    if (!isAppUrl(request.frame?.url ?? '')) {
      callback(null);
      return;
    }
    void desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        const screenSource = sources[0];
        if (!screenSource) {
          callback(null);
          return;
        }
        const support = loopbackSupport(process.platform);
        callback({
          video: screenSource,
          ...(support.system || process.env['CLEARLY_TRY_LOOPBACK'] === '1'
            ? { audio: 'loopback' as const }
            : {}),
        });
      })
      .catch(() => {
        callback(null);
      });
  });
}

// ---------------------------------------------------------------------------------------------
// IPC

type Impl = {
  [C in DesktopChannel]: (
    req: z.infer<(typeof DESKTOP_CHANNELS)[C]['request']>,
    e: IpcMainInvokeEvent,
  ) => Promise<z.infer<(typeof DESKTOP_CHANNELS)[C]['reply']>>;
};

const writeBackupSoon = debounce(1000, async (json: string) => {
  await writeAtomic(userFile('profile-backup.json'), json);
});

function acceptToFilters(accept: string): Electron.FileFilter[] {
  const types = accept.split(',').map((s) => s.trim());
  const ext = new Set<string>();
  for (const t of types) {
    if (t.startsWith('.')) ext.add(t.slice(1));
    else if (t === 'audio/*')
      for (const e of ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm']) ext.add(e);
    else if (t === 'video/*')
      for (const e of ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi']) ext.add(e);
    else if (t === 'application/json') ext.add('json');
  }
  return ext.size > 0 ? [{ name: 'Media', extensions: [...ext] }] : [];
}

function registerShortcut(accelerator: string | null): void {
  if (shortcut && shortcutRegistered) globalShortcut.unregister(shortcut);
  shortcut = accelerator;
  shortcutRegistered = false;
  if (!accelerator) return;
  try {
    shortcutRegistered = globalShortcut.register(accelerator, () => {
      sendTray('toggle');
    });
  } catch {
    shortcutRegistered = false;
  }
}

const impl: Impl = {
  getVersion: () => Promise.resolve({ version: app.getVersion(), downloadUrl: DOWNLOAD_URL }),
  async saveFile(req, e) {
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts = { defaultPath: join(app.getPath('downloads'), basename(req.suggestedName)) };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return 'cancelled';
    await writeFile(r.filePath, req.data);
    return 'saved';
  },
  async openFile(req, e) {
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts = { properties: ['openFile' as const], filters: acceptToFilters(req.accept) };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const path = r.filePaths[0];
    if (r.canceled || !path) return null;
    const data = new Uint8Array(await readFile(path));
    return { name: basename(path), type: mimeFor(path).split(';')[0] ?? '', data };
  },
  async showFloatingCaptions() {
    await captions.show(`${APP_ORIGIN}/__desktop/captions.html`);
    return null;
  },
  updateCaptionText(req) {
    captions.update(req.text, req.final);
    return Promise.resolve(null);
  },
  hideFloatingCaptions() {
    captions.hide();
    return Promise.resolve(null);
  },
  setTrayState(req) {
    trayMode = req.mode;
    trayActive = req.active;
    updateTray();
    return Promise.resolve(null);
  },
  writeBackup(req) {
    writeBackupSoon(req.json);
    return Promise.resolve(null);
  },
  async revealBackup() {
    await writeBackupSoon.flush();
    const path = userFile('profile-backup.json');
    try {
      await readFile(path);
      shell.showItemInFolder(path);
    } catch {
      await shell.openPath(app.getPath('userData'));
    }
    return null;
  },
  getLoopbackSupport: () => Promise.resolve(loopbackSupport(process.platform)),
  async setGlobalShortcut(req) {
    registerShortcut(req.accelerator);
    await writeAtomic(userFile('settings.json'), JSON.stringify({ shortcut: req.accelerator }));
    return { accelerator: shortcut, registered: shortcutRegistered };
  },
};

function registerIpc(): void {
  for (const channel of DESKTOP_CHANNEL_NAMES) {
    const schema = DESKTOP_CHANNELS[channel];
    ipcMain.handle(ipcName(channel), async (event, payload: unknown) => {
      // Only the app's own pages may call in, whatever the payload.
      if (!isAppUrl(event.senderFrame?.url ?? '')) throw new Error('not allowed');
      const req = schema.request.safeParse(payload ?? {});
      if (!req.success) throw new Error(`invalid ${channel} request`);
      const run = impl[channel] as (r: unknown, e: IpcMainInvokeEvent) => Promise<unknown>;
      return schema.reply.parse(await run(req.data, event));
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Tray and menu

function updateTray(): void {
  if (!tray) return;
  tray.setToolTip(
    trayActive ? `Clearly: ${trayMode === 'enhanced' ? 'Enhanced' : 'Original'}` : 'Clearly',
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Enhanced',
        type: 'radio',
        checked: trayMode === 'enhanced',
        click: () => {
          sendTray('enhanced');
        },
      },
      {
        label: 'Original',
        type: 'radio',
        checked: trayMode === 'original',
        click: () => {
          sendTray('original');
        },
      },
      { type: 'separator' },
      {
        label: 'Show Clearly',
        click: () => {
          showMain();
        },
      },
      { label: 'Quit', role: 'quit' },
    ]),
  );
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(STATIC_ROOT, 'tray.png'));
  tray = new Tray(
    icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 18, height: 18 }),
  );
  updateTray();
}

function showMain(): void {
  if (!mainWindow) {
    void createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createMenu(): void {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          ...(app.isPackaged
            ? []
            : [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }]),
        ],
      },
      { role: 'windowMenu' },
      {
        role: 'help',
        submenu: [
          { label: `Clearly ${app.getVersion()}`, enabled: false },
          {
            label: 'Download page',
            click: () => {
              if (isExternalAllowed(DOWNLOAD_URL)) void shell.openExternal(DOWNLOAD_URL);
            },
          },
        ],
      },
    ]),
  );
}

// ---------------------------------------------------------------------------------------------
// Start

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMain();
  });
  lockDown();
  void app.whenReady().then(async () => {
    protocol.handle(APP_SCHEME, (request) => {
      if (new URL(request.url).host !== APP_HOST) return new Response('Forbidden', { status: 403 });
      return handleApp(request);
    });
    lockDownSession();
    registerIpc();
    createMenu();
    createTray();
    const settings = (await readJson(userFile('settings.json'))) as {
      shortcut?: string | null;
    } | null;
    registerShortcut(
      settings && 'shortcut' in settings ? (settings.shortcut ?? null) : DEFAULT_SHORTCUT,
    );
    await createMainWindow();
    app.on('activate', () => {
      showMain();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    void writeBackupSoon.flush();
  });
}
