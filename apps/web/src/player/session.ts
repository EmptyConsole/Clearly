// One playing source through buildProcessingGraph on the app's AudioContext.

import type { GraphSettings, ProcessingGraph, ProcessingMode } from '@clearly/audio';
import type { Profile } from '@clearly/core';
import type { AudioEngine } from '../audio/AudioEngine.ts';

export type SessionInput =
  | { readonly kind: 'element'; readonly element: HTMLMediaElement }
  | { readonly kind: 'stream'; readonly stream: MediaStream };

export class PlayerSession {
  private constructor(
    readonly graph: ProcessingGraph,
    private readonly source: AudioNode,
    readonly ctx: AudioContext,
  ) {}

  static async create(
    engine: AudioEngine,
    input: SessionInput,
    profile: Profile | null,
    settings: GraphSettings,
    mode: ProcessingMode,
  ): Promise<PlayerSession> {
    const ctx = engine.context;
    if (!ctx) throw new Error('the audio engine has not started');
    const { buildProcessingGraph } = await import('@clearly/audio');
    const source =
      input.kind === 'element'
        ? ctx.createMediaElementSource(input.element)
        : ctx.createMediaStreamSource(input.stream);
    const graph = await buildProcessingGraph(ctx, profile, settings, { input: source, mode });
    return new PlayerSession(graph, source, ctx);
  }

  dispose(): void {
    this.graph.dispose();
    this.source.disconnect();
  }
}

/** Routes the context to an output device where AudioContext.setSinkId exists. */
export async function setOutputDevice(ctx: AudioContext, deviceId: string): Promise<boolean> {
  const c = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (typeof c.setSinkId !== 'function') return false;
  try {
    await c.setSinkId(deviceId);
    return true;
  } catch {
    await c.setSinkId('').catch(() => undefined);
    return false;
  }
}
