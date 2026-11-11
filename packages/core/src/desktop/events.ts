// Desktop event names (M12), without zod, so the tiny captions preload stays tiny.

/** Main to renderer: tray menu and global-shortcut commands. */
export const TRAY_COMMAND_EVENT = 'clearly:tray-command';
/** Main to the floating captions window. */
export const CAPTION_EVENT = 'clearly:caption';

/** The default global shortcut that switches Original | Enhanced. */
export const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+E';
