#!/usr/bin/env node
/**
 * The Staff console on this machine, with the houses it serves:
 *
 *   node tools/console-local.mjs
 *
 *   :4180  the console              (CONSOLE_SETUP_CODE below, for the owner's first passkey)
 *   :4173  Bella Vigna, preview mode (invented reservations, nothing real leaves)
 *   :4174  LunArt's Staff API, faked  (tools/fake-lunart.mjs), or LunArt itself with LUNART_DIR
 *
 * Every secret is made fresh for this run and lives only in these processes.
 * Passkeys need `localhost` (or https): open http://localhost:4180.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const secret = () => randomBytes(24).toString('base64url');
const s = {
  bvService: secret(), bvRelay: secret(), bvShared: secret(),
  lunart: secret(), lunartRelay: secret(),
  setup: process.env.CONSOLE_SETUP_CODE || secret(),
};
const ports = { console: 4180, bv: 4173, lunart: 4174 };
const base = { ...process.env, NODE_ENV: 'development' };

/**
 * LUNART_DIR=/path/to/a/lunart/checkout runs LunArt's real server (from the PR
 * branch, in LUNART_PREVIEW mode) instead of the fake Staff API, so the console
 * is tried against both real Cores.
 */
const lunartDir = process.env.LUNART_DIR ?? '';
const lunart = lunartDir
  ? ['lunart', [join(lunartDir, 'server/index.js')], {
    PORT: String(ports.lunart), LUNART_PREVIEW: '1', STAFF_TOKEN: secret(),
    CONSOLE_SERVICE_TOKEN: s.lunart, CONSOLE_URL: `http://localhost:${ports.console}`,
    CONSOLE_RELAY_URL: `http://127.0.0.1:${ports.console}`, CONSOLE_RELAY_SECRET: s.lunartRelay,
  }, lunartDir]
  : ['lunart', ['tools/fake-lunart.mjs'], { PORT: String(ports.lunart), LUNART_TOKEN: s.lunart }];

const children = [
  lunart,
  ['bella-vigna', ['server/index.js'], {
    PORT: String(ports.bv), GUIDE_PREVIEW: '1', STAFF_TOKEN: s.bvShared,
    CONSOLE_SERVICE_TOKEN: s.bvService, CONSOLE_URL: `http://localhost:${ports.console}`,
    CONSOLE_RELAY_URL: `http://127.0.0.1:${ports.console}`, CONSOLE_RELAY_SECRET: s.bvRelay,
  }],
  ['console', ['server/console/index.js'], {
    PORT: String(ports.console), CONSOLE_PREVIEW: '1',
    CONSOLE_PUBLIC_URL: `http://localhost:${ports.console}`,
    CONSOLE_SETUP_CODE: s.setup,
    CONSOLE_DATA_DIR: process.env.CONSOLE_DATA_DIR ?? '',
    CONSOLE_STEP_UP_MINUTES: process.env.CONSOLE_STEP_UP_MINUTES ?? '5',
    CONSOLE_PROPERTY_LUNART_URL: `http://127.0.0.1:${ports.lunart}`,
    CONSOLE_PROPERTY_LUNART_TOKEN: s.lunart,
    CONSOLE_PROPERTY_LUNART_RELAY_SECRET: s.lunartRelay,
    CONSOLE_PROPERTY_BELLA_VIGNA_URL: `http://127.0.0.1:${ports.bv}`,
    CONSOLE_PROPERTY_BELLA_VIGNA_TOKEN: s.bvService,
    CONSOLE_PROPERTY_BELLA_VIGNA_RELAY_SECRET: s.bvRelay,
  }],
].map(([name, args, env, cwd]) => {
  const child = spawn(process.execPath, args, { cwd, env: { ...base, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (chunk) => chunk.toString().split('\n').filter((line) => line.trim()).map((line) => `[${name}] ${line}\n`).join('');
  child.stdout.on('data', (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr.on('data', (chunk) => process.stderr.write(prefix(chunk)));
  return child;
});

console.log(`\n  console:    http://localhost:${ports.console}`);
console.log(`  setup code: ${s.setup}   (owner's first passkey; this run only)\n`);
const stop = () => { for (const child of children) child.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
