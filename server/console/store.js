/**
 * What the console keeps: people, passkeys, sessions, devices, the audit log.
 *
 * Never a guest, a reservation or an order — those stay in each property's own
 * store and only pass through the console on their way to a screen.
 *
 * One JSON document, small by construction, behind one of three backends:
 *   - `file`     a file in CONSOLE_DATA_DIR (a persistent disk), written atomically;
 *   - `postgres` one row in DATABASE_URL, for hosts whose disks do not persist
 *                (Render's free web services);
 *   - `memory`   tests and a throwaway local run.
 *
 * Writes go through one promise chain, so two requests cannot interleave a
 * read-modify-write. The document is stamped `meta.kind = 'staff-console'`, and a
 * guide's store — or anything else — pointed at by mistake is refused.
 */

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const CONSOLE_KIND = 'staff-console';

/** How much history the console keeps of itself. */
export const LIMITS = { audit: 5000, notifications: 200 };

const EMPTY = () => ({
  meta: { kind: CONSOLE_KIND, created_at: new Date().toISOString() },
  users: {},
  credentials: {},
  sessions: {},
  challenges: {},
  invites: {},
  subscriptions: {},
  relay_seen: {},
  notifications: [],
  audit: [],
  secrets: {},
});

export class ConsoleStoreError extends Error {
  constructor(message) { super(message); this.name = 'ConsoleStoreError'; this.code = 'console-store-refused'; }
}

function check(doc, where) {
  if (!doc || typeof doc !== 'object') return EMPTY();
  if (doc.meta?.kind !== CONSOLE_KIND) {
    throw new ConsoleStoreError(`${where} does not hold a staff console (meta.kind = ${JSON.stringify(doc.meta?.kind ?? null)}). Refusing to read or overwrite it.`);
  }
  return { ...EMPTY(), ...doc };
}

function memoryBackend() {
  let saved = null;
  return {
    name: 'memory',
    async load() { return saved ? JSON.parse(saved) : null; },
    async save(doc) { saved = JSON.stringify(doc); },
  };
}

function fileBackend(dataDir) {
  const file = join(dataDir, 'console.json');
  return {
    name: 'file',
    where: file,
    async load() {
      if (!existsSync(file)) return null;
      return JSON.parse(await readFile(file, 'utf8'));
    },
    async save(doc) {
      await mkdir(dataDir, { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(doc), { mode: 0o600 });
      await rename(temp, file);
    },
  };
}

/**
 * One row in Postgres. `pg` is only loaded when a database is configured, so a
 * guide server never pays for it.
 */
function postgresBackend(databaseUrl, { ssl = true } = {}) {
  let pool = null;
  const connect = async () => {
    if (pool) return pool;
    const { default: pg } = await import('pg');
    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 2,
      ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_console_state (
      id text PRIMARY KEY, doc jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    return pool;
  };
  return {
    name: 'postgres',
    where: 'DATABASE_URL',
    async load() {
      const db = await connect();
      const { rows } = await db.query('SELECT doc FROM staff_console_state WHERE id = $1', ['console']);
      return rows[0]?.doc ?? null;
    },
    async save(doc) {
      const db = await connect();
      await db.query(`INSERT INTO staff_console_state (id, doc, updated_at) VALUES ($1, $2, now())
        ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`, ['console', doc]);
    },
    async close() { await pool?.end(); pool = null; },
  };
}

export function chooseBackend({ dataDir = '', databaseUrl = '', databaseSsl = true } = {}) {
  if (databaseUrl) return postgresBackend(databaseUrl, { ssl: databaseSsl });
  if (dataDir) return fileBackend(dataDir);
  return memoryBackend();
}

/**
 * `read(fn)` hands `fn` a snapshot; `update(fn)` hands it the live document and
 * saves whatever it leaves there. Both return what `fn` returns.
 */
export async function createConsoleStore(options = {}) {
  const backend = options.backend ?? chooseBackend(options);
  let doc = check(await backend.load(), backend.where ?? backend.name);
  let chain = Promise.resolve();

  const trim = () => {
    if (doc.audit.length > LIMITS.audit) doc.audit.splice(0, doc.audit.length - LIMITS.audit);
    if (doc.notifications.length > LIMITS.notifications) {
      doc.notifications.splice(0, doc.notifications.length - LIMITS.notifications);
    }
  };

  const store = {
    backend: backend.name,
    async read(fn) {
      await chain;
      return fn(structuredClone(doc));
    },
    update(fn) {
      // The change is made on a copy and adopted only once it is saved, so a
      // handler that throws halfway leaves nothing half-done behind.
      const run = chain.then(async () => {
        const draft = structuredClone(doc);
        const result = await fn(draft);
        doc = draft;
        trim();
        await backend.save(doc);
        return result;
      });
      chain = run.catch(() => {});
      return run;
    },
    async close() { await chain; await backend.close?.(); },
  };
  // A fresh store is written at once, so the stamp exists before anything else does.
  if (!doc.meta.saved_at) await store.update((d) => { d.meta.saved_at = new Date().toISOString(); });
  return store;
}
