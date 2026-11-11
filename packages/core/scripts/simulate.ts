// Runs the fixed-seed accuracy simulation (1000 Express + 1000 Refine runs), writes the report to
// docs/sim-results.txt and the trial-count constants to src/generated/simStats.ts.
// Usage: pnpm --filter @clearly/core sim
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatReport, generatedStatsSource } from '../src/sim/report.ts';
import {
  SIM_RUNS,
  SIM_SEED_EXPRESS,
  SIM_SEED_REFINE,
  simulate,
  summarise,
} from '../src/sim/run.ts';

const express = summarise(
  'express',
  simulate({ method: 'express', runs: SIM_RUNS, seed: SIM_SEED_EXPRESS }),
);
const refine = summarise(
  'refine',
  simulate({ method: 'refine', runs: SIM_RUNS, seed: SIM_SEED_REFINE }),
);

const docs = fileURLToPath(new URL('../../../docs/sim-results.txt', import.meta.url));
const generated = fileURLToPath(new URL('../src/generated/simStats.ts', import.meta.url));
writeFileSync(docs, formatReport(express, refine));
writeFileSync(generated, generatedStatsSource(express, refine));
console.log(`wrote ${docs}\nwrote ${generated}`);
