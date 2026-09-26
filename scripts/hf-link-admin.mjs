import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConnectionEnv } from './hf-readiness.mjs';
import { createHfStorage } from '../server/hf-storage.mjs';
import { createHfState } from '../server/hf-state.mjs';
import { openDatabase } from '../server/database.mjs';
import { hashPassword, verifyPassword, id } from '../server/security.mjs';

const EXPECTED_EMAIL = '60base.ai@gmail.com';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VERSION = '2026-09-14-google-v1';
const REGISTRATION_KEYS = ['schemaVersion','provider','email','emailVerified','displayName','adultDeclared','termsVersion','privacyVersion','termsAcceptedAt','privacyAcknowledgedAt','createdAt','updatedAt','source'];
class LinkError extends Error {}
function fail(message) { throw new LinkError(message); }
function parse(text) { try { return JSON.parse(text); } catch { fail('Invalid audit evidence'); } }
function normalizedEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function validResource(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value); }
function registrationValid(value, email) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === REGISTRATION_KEYS.length && REGISTRATION_KEYS.every(key => Object.hasOwn(value, key)) &&
    value.schemaVersion === 1 && value.provider === 'google.com' && normalizedEmail(value.email) === email && value.emailVerified === true && value.adultDeclared === true && value.termsVersion === VERSION && value.privacyVersion === VERSION && value.source === 'studio-web' &&
    typeof value.displayName === 'string' && value.displayName.length > 0 && value.displayName.length <= 60 && ['termsAcceptedAt','privacyAcknowledgedAt','createdAt','updatedAt'].every(key => Number.isSafeInteger(value[key]) && value[key] > 0);
}
function snapshot(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map(row => JSON.stringify(row)).sort()]));
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function inspect(store, eventId, email) {
  const event = store.one('SELECT * FROM audit WHERE id=?', eventId);
  if (!event || event.action !== 'account.google.link_requested' || event.actorId !== null) fail('Explicit event is not verified Google link-request evidence');
  const detail = parse(event.detail);
  if (detail.provider !== 'firebase' || detail.email !== email || typeof detail.uid !== 'string' || !detail.uid.trim() || detail.uid.length > 128 || /[\x00-\x1f\x7f]/.test(detail.uid) || !registrationValid(detail.registration, email)) fail('Audit identity or registration does not match');
  const user = store.one('SELECT * FROM users WHERE id=?', event.target);
  if (!user || user.email !== email || user.role !== 'admin' || user.status !== 'active') fail('Target must be the existing active administrator with the exact email');
  const targetIdentity = store.one('SELECT * FROM auth_identities WHERE userId=?', user.id);
  const uidIdentity = store.one("SELECT * FROM auth_identities WHERE provider='firebase' AND uid=?", detail.uid);
  const completions = store.all("SELECT * FROM audit WHERE action='account.google.link_completed' AND target=?", user.id).filter(row => parse(row.detail).evidenceEventId === eventId);
  if (targetIdentity || uidIdentity || completions.length) {
    if (!targetIdentity || !uidIdentity || targetIdentity.provider !== 'firebase' || targetIdentity.uid !== detail.uid || uidIdentity.userId !== user.id || completions.length !== 1) fail('Existing or partial identity binding conflicts with this evidence');
    const completion = parse(completions[0].detail);
    if (completions[0].actorId !== null || completion.provider !== 'firebase' || completion.uid !== detail.uid || completion.passwordRotated !== true || completion.sessionsRevoked !== true || user.forcePassword !== 0 || !same(parse(user.consent), detail.registration) || store.one('SELECT COUNT(*) n FROM sessions WHERE userId=?', user.id).n !== 0) fail('Completed binding does not satisfy the expected administrator state');
    return { event, detail, user, completed: true, completionId: completions[0].id };
  }
  return { event, detail, user, completed: false };
}
async function boundedBytes(response) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 64 * 1024 * 1024) fail('Checkpoint exceeds supported size'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
async function backup(bytes, directory, eventId) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('Backup directory must be a real directory outside the repository');
  const actual = await realpath(directory), repo = await realpath(ROOT);
  if (actual === repo || actual.startsWith(repo + path.sep)) fail('Backup directory must be outside the repository');
  await chmod(directory, 0o700);
  const filename = path.join(directory, `admin-link-${eventId}-${randomBytes(8).toString('hex')}.bin`);
  await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 });
  if (!(await readFile(filename)).equals(bytes)) fail('Encrypted checkpoint backup verification failed');
  return filename;
}

export async function linkAdmin({ env = process.env, eventId, email, apply = false, storage, fetchImpl = globalThis.fetch, closeStore = store => store.db.close(), removeDirectory = directory => rm(directory, { recursive: true, force: true }) } = {}) {
  const report = { ok: false, mode: apply === true ? 'apply' : 'plan', changed: false, verifiedRemote: false };
  const directories = []; const stores = [];
  try {
    email = normalizedEmail(email);
    if (email !== EXPECTED_EMAIL || typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) fail('Explicit event ID and expected administrator email are required');
    for (const key of ['HF_TOKEN','HF_SPACE_ID','HF_BUCKET_ID','HF_STATE_KEY']) if (typeof env[key] !== 'string' || !env[key]) fail(`Missing ${key}`);
    if (!validResource(env.HF_SPACE_ID) || !validResource(env.HF_BUCKET_ID)) fail('Invalid Hugging Face resource ID');
    const owner = env.HF_SPACE_ID.split('/')[0];
    if (env.HF_BUCKET_ID.split('/')[0] !== owner) fail('Bucket and Space must belong to the same verified account');
    async function hf(route) {
      const response = await fetchImpl(`https://huggingface.co${route}`, { method: 'GET', headers: { Authorization: `Bearer ${env.HF_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) fail(`Hugging Face API returned HTTP ${response.status}`);
      return response.json();
    }
    const account = await hf('/api/whoami-v2');
    if (account.type !== 'user' || account.isPro !== true || account.name !== owner) fail('Verified personal PRO ownership is required');
    async function assertPaused() {
      const space = await hf(`/api/spaces/${env.HF_SPACE_ID}`);
      if (space.id !== env.HF_SPACE_ID || space.private !== true || space.sdk !== 'docker') fail('Space identity, privacy or Docker configuration does not match');
      const runtime = await hf(`/api/spaces/${env.HF_SPACE_ID}/runtime`);
      if (runtime.stage !== 'PAUSED') fail('Space must be PAUSED before administrator linking');
    }
    await assertPaused();
    storage ||= createHfStorage({ bucket: env.HF_BUCKET_ID, accessKeyId: env.HF_S3_ACCESS_KEY_ID, secretAccessKey: env.HF_S3_SECRET_ACCESS_KEY, fetchImpl });
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hf-link-admin-')); directories.push(directory);
    let originalBytes;
    const capturedStorage = {
      get: async key => { const response = await storage.get(key); originalBytes = await boundedBytes(response); return new Response(originalBytes, { status: response.status, headers: response.headers }); },
      head: (...args) => storage.head(...args), put: (...args) => storage.put(...args),
    };
    const state = createHfState({ storage: capturedStorage, directory, encryptionKey: env.HF_STATE_KEY });
    await state.restore();
    const originalDb = new DatabaseSync(path.join(directory, 'dongjakso.sqlite'), { readOnly: true });
    let original;
    try { original = snapshot(originalDb); } finally { originalDb.close(); }
    const store = openDatabase(directory); stores.push(store);
    if (!same(original, snapshot(store.db))) fail('Database opening would change records outside the link operation');
    const evidence = inspect(store, eventId, email);
    Object.assign(report, { eventId, email, userId: evidence.user.id, uid: evidence.detail.uid, action: evidence.completed ? 'already_completed' : 'link' });
    if (!apply) { report.ok = true; return report; }
    let completionId = evidence.completionId;
    if (!evidence.completed) {
      await assertPaused();
      report.backupFile = await backup(originalBytes, env.HF_LINK_BACKUP_DIR || path.join(os.homedir(), '.local/share/dongjakso-hf/backups'), eventId);
      const encoded = await hashPassword(randomBytes(64).toString('base64url'));
      completionId = id('evt');
      store.transaction(() => {
        const timestamp = store.now();
        store.run('INSERT INTO auth_identities VALUES(?,?,?,?)', 'firebase', evidence.detail.uid, evidence.user.id, timestamp);
        store.run('UPDATE users SET password=?,consent=?,forcePassword=0,updatedAt=? WHERE id=?', encoded, JSON.stringify(evidence.detail.registration), timestamp, evidence.user.id);
        store.run('DELETE FROM sessions WHERE userId=?', evidence.user.id);
        store.run('INSERT INTO audit VALUES(?,?,?,?,?,?)', completionId, null, 'account.google.link_completed', evidence.user.id, JSON.stringify({ evidenceEventId: eventId, provider: 'firebase', uid: evidence.detail.uid, passwordRotated: true, sessionsRevoked: true }), timestamp);
      });
      // Exact preserved-row checks guard against accidental changes beyond this transaction.
      const expected = snapshot(store.db);
      for (const table of Object.keys(original)) if (!['users','sessions','auth_identities','audit'].includes(table) && !same(original[table], expected[table])) fail('Unrelated records changed');
      const stripChangedUser = row => { const value = JSON.parse(row); if (value.id === evidence.user.id) for (const key of ['password','consent','forcePassword','updatedAt']) delete value[key]; return JSON.stringify(value); };
      if (!same(original.users.map(stripChangedUser).sort(), expected.users.map(stripChangedUser).sort()) ||
        !same(original.sessions.filter(row => JSON.parse(row).userId !== evidence.user.id), expected.sessions) ||
        !same(original.auth_identities, expected.auth_identities.filter(row => JSON.parse(row).userId !== evidence.user.id)) ||
        !same(original.audit, expected.audit.filter(row => JSON.parse(row).id !== completionId))) fail('Records outside the authorized administrator change were modified');
      if (store.one('SELECT password FROM users WHERE id=?', evidence.user.id).password === evidence.user.password) fail('Bootstrap password was not rotated');
      if (env.DONGJAKSO_ADMIN_PASSWORD && await verifyPassword(env.DONGJAKSO_ADMIN_PASSWORD, encoded)) fail('Bootstrap password is still valid');
      await assertPaused();
      try { await state.checkpoint(store); } catch { report.checkpointOutcome = 'uncertain'; }
    }
    const expected = snapshot(store.db);
    const verificationDirectory = await mkdtemp(path.join(os.tmpdir(), 'hf-link-verify-')); directories.push(verificationDirectory);
    const verificationState = createHfState({ storage, directory: verificationDirectory, encryptionKey: env.HF_STATE_KEY });
    await verificationState.restore();
    const remoteDb = new DatabaseSync(path.join(verificationDirectory, 'dongjakso.sqlite'), { readOnly: true });
    try { if (!same(expected, snapshot(remoteDb))) fail('Remote checkpoint does not exactly match the expected linked state; keep Space paused'); }
    finally { remoteDb.close(); }
    const verified = openDatabase(verificationDirectory); stores.push(verified);
    if (!same(expected, snapshot(verified.db))) fail('Remote checkpoint does not exactly match the expected linked state; keep Space paused');
    const result = inspect(verified, eventId, email);
    if (!result.completed || result.completionId !== completionId) fail('Remote administrator binding was not verified');
    if (env.DONGJAKSO_ADMIN_PASSWORD && await verifyPassword(env.DONGJAKSO_ADMIN_PASSWORD, result.user.password)) fail('Remote bootstrap password is still valid');
    await verificationState.assertCurrent();
    await assertPaused();
    report.ok = true; report.changed = !evidence.completed; report.verifiedRemote = true; report.completionId = completionId;
  } catch (error) { report.error = error instanceof LinkError ? error.message : 'Administrator linking failed; keep Space paused and inspect checkpoint state'; }
  finally {
    const cleanupErrors = [];
    const remainingTempDirectories = [];
    for (const store of stores) {
      try { await closeStore(store); }
      catch { cleanupErrors.push('Unable to close a temporary database'); }
    }
    for (const directory of directories) {
      try { await removeDirectory(directory); }
      catch { cleanupErrors.push('Unable to remove a temporary data directory'); }
      try {
        await lstat(directory);
        remainingTempDirectories.push(directory);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          remainingTempDirectories.push(directory);
          cleanupErrors.push('Unable to verify temporary directory removal');
        }
      }
    }
    if (cleanupErrors.length || remainingTempDirectories.length) {
      report.ok = false;
      report.error ||= 'Temporary sensitive-data cleanup failed; keep Space paused';
      report.cleanupErrors = [...new Set(cleanupErrors)];
      report.remainingTempDirectories = remainingTempDirectories;
    }
  }
  return report;
}
export async function main({ args = process.argv.slice(2), env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const options = {}; let apply = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--apply' && !apply) apply = true;
    else if (['--event','--email'].includes(arg) && !options[arg] && args[index + 1] && !args[index + 1].startsWith('--')) options[arg] = args[++index];
    else return { ok: false, error: 'Usage: node scripts/hf-link-admin.mjs --event EVENT_ID --email 60base.ai@gmail.com [--apply]' };
  }
  if (!options['--event'] || !options['--email']) return { ok: false, error: 'Explicit --event and --email are required' };
  try { return await linkAdmin({ env: await loadConnectionEnv(env), eventId: options['--event'], email: options['--email'], apply, fetchImpl }); }
  catch { return { ok: false, error: 'Unable to load Hugging Face connection credentials' }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await main(); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.ok ? 0 : 1;
}
