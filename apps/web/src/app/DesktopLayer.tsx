// Desktop app only (M12), loaded lazily by the layout when the platform is the desktop adapter:
// - the automatic backup: after every data change (debounced), the full backup goes to
//   profile-backup.json in the app's user-data folder (the main process writes it atomically);
// - tray menu and global-shortcut commands, passed to whatever player is open as a window event.

import { useEffect } from 'react';
import { DESKTOP_MODE_EVENT, isDesktopAdapter } from '../platform/desktop.ts';
import { usePlatform } from '../platform/context.ts';
import { backupBlob, buildBackup } from '../storage/backup.ts';
import { onDataChanged } from '../storage/events.ts';

const BACKUP_DEBOUNCE_MS = 1500;

export default function DesktopLayer() {
  const platform = usePlatform();

  useEffect(() => {
    if (!isDesktopAdapter(platform)) return;
    const bridge = platform.bridge;
    let timer: number | null = null;
    const write = () => {
      void buildBackup({ includeHistory: true })
        .then((doc) => backupBlob(doc).text())
        .then((json) => bridge.writeBackup({ json }))
        .catch(() => undefined);
    };
    const off = onDataChanged((kind) => {
      // Cached captions are not part of a backup.
      if (kind === 'captionCache') return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(write, BACKUP_DEBOUNCE_MS);
    });
    write();
    const offTray = bridge.onTrayCommand((command) => {
      window.dispatchEvent(new CustomEvent(DESKTOP_MODE_EVENT, { detail: command }));
    });
    return () => {
      off();
      offTray();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [platform]);

  return null;
}
