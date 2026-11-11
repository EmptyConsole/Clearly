// The floating captions window (M12): frameless, always on top, resizable, with an optional
// transparent background. Its position is remembered per display. The main window sends caption
// text over IPC; the page reads it out through an aria-live region and closes with Escape.

import { CAPTION_EVENT } from '@clearly/core/desktop-events';
import { BrowserWindow, screen } from 'electron';
import { readJson, writeAtomic } from './jsonFile.ts';
import { isAllowedNavigation } from './security.ts';
import { CaptionPositions, isVisibleOn, type Bounds } from './windowState.ts';

export interface CaptionsOptions {
  readonly origin: string;
  readonly positionsFile: () => string;
  readonly preload: string;
}

const DEFAULT_SIZE = { width: 720, height: 160 };

export class CaptionsWindow {
  private win: BrowserWindow | null = null;
  private readonly o: CaptionsOptions;

  constructor(o: CaptionsOptions) {
    this.o = o;
  }

  async show(url: string): Promise<void> {
    if (this.win) {
      this.win.showInactive();
      return;
    }
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const positions = CaptionPositions.safeParse(await readJson(this.o.positionsFile()));
    const saved = positions.success ? positions.data[String(display.id)] : undefined;
    const area = display.workArea;
    const bounds: Bounds =
      saved && isVisibleOn(saved, [area])
        ? saved
        : {
            x: Math.round(area.x + (area.width - DEFAULT_SIZE.width) / 2),
            y: Math.round(area.y + area.height - DEFAULT_SIZE.height - 40),
            ...DEFAULT_SIZE,
          };
    const win = new BrowserWindow({
      ...bounds,
      minWidth: 240,
      minHeight: 60,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      focusable: true,
      show: false,
      title: 'Clearly captions',
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        preload: this.o.preload,
      },
    });
    win.setAlwaysOnTop(true, 'floating');
    win.webContents.on('will-navigate', (e, target) => {
      if (!isAllowedNavigation(target)) e.preventDefault();
    });
    const remember = () => {
      void this.savePosition(win);
    };
    win.on('moved', remember);
    win.on('resized', remember);
    win.on('closed', () => {
      this.win = null;
    });
    this.win = win;
    await win.loadURL(url);
    win.showInactive();
  }

  update(text: string, final: boolean): void {
    this.win?.webContents.send(CAPTION_EVENT, { text, final });
  }

  hide(): void {
    this.win?.close();
    this.win = null;
  }

  private async savePosition(win: BrowserWindow): Promise<void> {
    const b = win.getBounds();
    const display = screen.getDisplayMatching(b);
    const file = this.o.positionsFile();
    const prev = CaptionPositions.safeParse(await readJson(file));
    const all = prev.success ? prev.data : {};
    all[String(display.id)] = b;
    await writeAtomic(file, JSON.stringify(all));
  }
}
