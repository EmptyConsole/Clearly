// The floating captions window's preload: it can only receive caption text and close itself.

import { CAPTION_EVENT } from '@clearly/core/desktop-events';
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clearlyCaptions', {
  onCaption(cb: (c: { text: string; final: boolean }) => void): void {
    ipcRenderer.on(CAPTION_EVENT, (_e, c: unknown) => {
      if (
        typeof c === 'object' &&
        c !== null &&
        typeof (c as { text?: unknown }).text === 'string' &&
        typeof (c as { final?: unknown }).final === 'boolean'
      )
        cb(c as { text: string; final: boolean });
    });
  },
});
