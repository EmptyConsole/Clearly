// Tuning-ladder search (M01 section 6). Explores the stage-1 parameters at a given maxTrials on a
// tuning seed that is NOT the validation seed, so the final 1000-run check is not overfitted.
// Usage: node scripts/tune.ts <maxTrials> [runs]
import { simulate, summarise } from '../src/sim/run.ts';

const maxTrials = Number(process.argv[2] ?? 4);
const runs = Number(process.argv[3] ?? 300);
const TUNING_SEED = 777;
const rows: string[] = [];
let passing = 0;
for (const stopSdDb of [4, 4.5, 5, 5.5, 6])
  for (const priorSdDb of [12, 13.5, 15, 16.5, 18])
    for (const shareSameEar of [0.4, 0.6, 0.8])
      for (const shareOtherEar of [0.15, 0.3, 0.45])
        for (const jitterDb of [0, 1, 2, 3]) {
          const params = { stopSdDb, priorSdDb, shareSameEar, shareOtherEar, jitterDb, maxTrials };
          const s = summarise(
            'express',
            simulate({ method: 'express', runs, seed: TUNING_SEED, expressParams: params }),
          );
          const pass = s.withinTolerance >= 0.95 && s.trialsMean <= 36 && s.trialsP95 <= 44;
          if (pass) passing++;
          rows.push(
            [
              pass ? 'PASS' : 'fail',
              stopSdDb,
              priorSdDb,
              shareSameEar,
              shareOtherEar,
              jitterDb,
              (s.withinTolerance * 100).toFixed(2),
              s.trialsMean.toFixed(2),
              s.trialsP95.toFixed(1),
            ].join('\t'),
          );
        }
rows.sort((a, b) => Number(b.split('\t')[6]) - Number(a.split('\t')[6]));
console.log(`maxTrials ${maxTrials}, runs ${runs}, passing ${passing}/${rows.length}`);
console.log('pass\tstopSd\tpriorSd\tsame\tother\tjitter\twithin%\tmeanTr\tp95Tr');
for (const r of rows.filter((r) => r.startsWith('PASS')).slice(0, 25)) console.log(r);
console.log('best overall by accuracy:');
for (const r of rows.slice(0, 10)) console.log(r);
console.log('fewest trials:');
for (const r of [...rows]
  .sort((a, b) => Number(a.split('\t')[7]) - Number(b.split('\t')[7]))
  .slice(0, 10))
  console.log(r);
