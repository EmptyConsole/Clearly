// Entry point: node dist/server.js (built) or node src/main.ts (development, Node type stripping).

import { buildApp, purgeExpiredCodes, purgeStaleProfiles } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';

const config = loadConfig();
const db = openDb(config.databasePath);
const app = await buildApp({ config, db });

const hourly = setInterval(() => {
  const n = purgeExpiredCodes(db, Date.now());
  if (n > 0) app.log.info({ purged: n }, 'expired restore codes removed');
}, 3_600_000);
const daily = setInterval(() => {
  const n = purgeStaleProfiles(db, Date.now(), config.retentionDays);
  if (n > 0) app.log.info({ purged: n }, 'profiles past the retention period removed');
}, 86_400_000);
hourly.unref();
daily.unref();
purgeExpiredCodes(db, Date.now());
purgeStaleProfiles(db, Date.now(), config.retentionDays);

const shutdown = () => {
  void app.close().then(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
