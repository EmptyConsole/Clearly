// The desktop bridge (M12): every channel between the web app (through the preload's
// window.clearlyDesktop) and Electron's main process, with zod schemas for each request and reply.
// Both sides validate: the preload before sending, the main process on receipt (and it also checks
// the sender frame's origin). Anything not listed here cannot cross the bridge.

import { z } from 'zod';

const MAX_SAVE_BYTES = 4 * 1024 ** 3;
const MAX_BACKUP_CHARS = 5 * 1024 * 1024;
const MAX_CAPTION_CHARS = 2000;

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 0x20) return true;
  return false;
}

const fileName = z
  .string()
  .min(1)
  .max(255)
  // No folders and no control characters: the main process shows a save dialog with this name.
  .refine((s) => !/[/\\]/.test(s) && !hasControlChar(s), 'a plain file name');

const bytes = z.instanceof(Uint8Array);

export const TrayCommand = z.enum(['enhanced', 'original', 'toggle']);
export type TrayCommand = z.infer<typeof TrayCommand>;

export const ShortcutState = z.object({
  /** An Electron accelerator ("CommandOrControl+Shift+E"), or null when turned off. */
  accelerator: z.string().max(100).nullable(),
  registered: z.boolean(),
});
export type ShortcutState = z.infer<typeof ShortcutState>;

export const LoopbackSupport = z.object({
  os: z.enum(['windows', 'macos', 'linux', 'other']),
  /** System sound through getDisplayMedia with audio 'loopback' (documented for Windows only). */
  system: z.boolean(),
  /**
   * 'loopbackWithMute' silences the original sound. Used only when a test on that OS confirmed it
   * keeps Clearly's own playback audible; false everywhere until then (DECISIONS M12).
   */
  withMute: z.boolean(),
});
export type LoopbackSupport = z.infer<typeof LoopbackSupport>;

/** Request and reply schema for every invoke channel. */
export const DESKTOP_CHANNELS = {
  getVersion: {
    request: z.object({}).strict(),
    reply: z.object({ version: z.string(), downloadUrl: z.url() }),
  },
  saveFile: {
    request: z
      .object({
        suggestedName: fileName,
        mimeType: z.string().max(100),
        data: bytes.refine((b) => b.byteLength <= MAX_SAVE_BYTES, 'at most 4 GB'),
      })
      .strict(),
    reply: z.enum(['saved', 'cancelled']),
  },
  openFile: {
    request: z.object({ accept: z.string().max(500) }).strict(),
    reply: z.object({ name: fileName, type: z.string().max(100), data: bytes }).nullable(),
  },
  showFloatingCaptions: { request: z.object({}).strict(), reply: z.null() },
  updateCaptionText: {
    request: z.object({ text: z.string().max(MAX_CAPTION_CHARS), final: z.boolean() }).strict(),
    reply: z.null(),
  },
  hideFloatingCaptions: { request: z.object({}).strict(), reply: z.null() },
  setTrayState: {
    request: z.object({ mode: z.enum(['original', 'enhanced']), active: z.boolean() }).strict(),
    reply: z.null(),
  },
  writeBackup: {
    request: z.object({ json: z.string().max(MAX_BACKUP_CHARS) }).strict(),
    reply: z.null(),
  },
  revealBackup: { request: z.object({}).strict(), reply: z.null() },
  getLoopbackSupport: { request: z.object({}).strict(), reply: LoopbackSupport },
  /**
   * The global shortcut (not in the M12 prompt's list, which names the shortcut as configurable
   * and failures as shown in Settings; that needs a channel): set or clear it, and read whether
   * registration worked.
   */
  setGlobalShortcut: {
    request: z.object({ accelerator: z.string().max(100).nullable() }).strict(),
    reply: ShortcutState,
  },
} as const;

export type DesktopChannel = keyof typeof DESKTOP_CHANNELS;
export const DESKTOP_CHANNEL_NAMES = Object.keys(DESKTOP_CHANNELS) as DesktopChannel[];
export type DesktopRequest<C extends DesktopChannel> = z.infer<
  (typeof DESKTOP_CHANNELS)[C]['request']
>;
export type DesktopReply<C extends DesktopChannel> = z.infer<(typeof DESKTOP_CHANNELS)[C]['reply']>;

/** The IPC channel name on the wire. */
export const ipcName = (c: DesktopChannel): string => `clearly:${c}`;
export { CAPTION_EVENT, DEFAULT_SHORTCUT, TRAY_COMMAND_EVENT } from './events.ts';

/** What the preload exposes as window.clearlyDesktop. */
export interface ClearlyDesktopBridge {
  readonly platform: 'desktop';
  getVersion(): Promise<DesktopReply<'getVersion'>>;
  saveFile(req: DesktopRequest<'saveFile'>): Promise<DesktopReply<'saveFile'>>;
  openFile(req: DesktopRequest<'openFile'>): Promise<DesktopReply<'openFile'>>;
  showFloatingCaptions(): Promise<null>;
  updateCaptionText(req: DesktopRequest<'updateCaptionText'>): Promise<null>;
  hideFloatingCaptions(): Promise<null>;
  setTrayState(req: DesktopRequest<'setTrayState'>): Promise<null>;
  onTrayCommand(cb: (c: TrayCommand) => void): () => void;
  writeBackup(req: DesktopRequest<'writeBackup'>): Promise<null>;
  revealBackup(): Promise<null>;
  getLoopbackSupport(): Promise<LoopbackSupport>;
  setGlobalShortcut(req: DesktopRequest<'setGlobalShortcut'>): Promise<ShortcutState>;
}

// Virtual audio cables (M12): device labels that identify one. Labels need microphone permission.
const CABLE_PATTERNS = [
  /blackhole/i,
  /vb-?cable/i,
  /\bcable (input|output)\b/i,
  // VB-Audio names its devices in capitals: "CABLE Input", "CABLE-A Output".
  /\bCABLE(-[A-D])?\b/,
  /\bloopback\b/i,
  /soundflower/i,
  /voicemeeter/i,
];

export function isVirtualCableLabel(label: string): boolean {
  return CABLE_PATTERNS.some((p) => p.test(label));
}

/**
 * Same physical device on both sides would feed Clearly's output back into its input. Compare by
 * groupId when the browser gives one (an input and output of the same device share it), and by
 * label otherwise.
 */
export function isSameDevice(
  input: { readonly groupId?: string; readonly label: string },
  output: { readonly groupId?: string; readonly label: string },
): boolean {
  if (input.groupId && output.groupId && input.groupId === output.groupId) return true;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(input|output|default)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return norm(input.label) !== '' && norm(input.label) === norm(output.label);
}
