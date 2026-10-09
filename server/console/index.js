#!/usr/bin/env node
/**
 * Boot the Staff console: one app for every property's staff.
 *
 *   node server/console/index.js
 *
 * It holds no guest data and runs no job of its own: it signs people in with
 * their passkeys and forwards what they may do to each property's Staff API.
 * Configuration is in `server/console/config.js`.
 */

import { createServer } from 'node:http';
import { CONSOLE_OPERATORS } from '../../data/console.js';
import { createConsoleApp } from './app.js';
import { syncOperators } from './auth.js';
import { consoleConfig } from './config.js';
import { createConsoleStore } from './store.js';

const config = consoleConfig();
let store;
try {
  store = await createConsoleStore(config);
} catch (error) {
  if (error?.code !== 'console-store-refused') throw error;
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
}
const people = await syncOperators(store, CONSOLE_OPERATORS);
const app = await createConsoleApp({ config, store });

createServer(app.handle).listen(config.port, () => {
  console.log(`\n  ${config.name}${config.preview ? ' — STAGING' : ''}`);
  console.log(`  ${config.publicUrl}`);
  console.log(`  store:      ${store.backend}`);
  console.log(`  people:     ${people} (${CONSOLE_OPERATORS.map((o) => `${o.name} · ${o.role}`).join(', ')})`);
  console.log(`  properties: ${config.properties.map((p) => `${p.name} → ${p.url}`).join(', ') || 'none'}`);
  console.log(`  push:       ${app.push.configured ? 'configured' : 'not configured'}`);
  for (const warning of config.warnings) console.log(`  ! ${warning}`);
  console.log('');
});
