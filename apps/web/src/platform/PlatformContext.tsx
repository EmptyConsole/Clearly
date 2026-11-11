import { useState, type ReactNode } from 'react';
import { PlatformContext } from './context.ts';
import { createPlatformAdapter } from './detect.ts';
import type { PlatformAdapter } from './types.ts';

export function PlatformProvider({
  adapter,
  children,
}: {
  adapter?: PlatformAdapter;
  children: ReactNode;
}) {
  const [value] = useState<PlatformAdapter>(() => adapter ?? createPlatformAdapter());
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}
