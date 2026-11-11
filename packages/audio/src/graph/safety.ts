// A standalone Safety limiter (ceiling -3 dBFS) for sound made outside buildProcessingGraph, such
// as the speech-in-noise check: RULES.md requires it to be the last node on every path.

import { SAFETY_CEILING_DBFS } from '../constants.ts';
import { createLimiterNode, ensureWorklets } from './worklets.ts';

export async function createSafetyLimiter(
  ctx: BaseAudioContext,
  output: AudioNode = ctx.destination,
): Promise<AudioWorkletNode> {
  await ensureWorklets(ctx);
  const node = createLimiterNode(ctx, { ceilingDbfs: SAFETY_CEILING_DBFS, fixed: true });
  node.connect(output);
  return node;
}
