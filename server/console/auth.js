/**
 * Signing in to the console: passkeys, sessions, invitations, recovery.
 *
 * Nothing cryptographic is written here. Passkeys are WebAuthn, verified by
 * @simplewebauthn/server; this module only decides *who* a verified passkey
 * belongs to and how long the resulting session lasts.
 *
 *   - Signing in: a discoverable passkey (Face ID, fingerprint, the phone's PIN).
 *     No username, no password, nothing shared between people.
 *   - Sessions: a random 256-bit value in an HttpOnly, Secure, SameSite=Strict
 *     cookie; the store keeps only its SHA-256. 14 days at most, 72 hours idle.
 *   - Step-up: refunds, bulk email, access management need a passkey check in the
 *     last five minutes, not just an open session — a phone left unlocked on the
 *     desk cannot refund anything.
 *   - Enrolment: by a single-use invitation link (72 h; recovery links 24 h) that
 *     the owner creates in the console and hands over in person or by phone.
 *   - The owner's first passkey, and the owner's last resort: CONSOLE_SETUP_CODE,
 *     an environment variable of the console service. Whoever can read it already
 *     controls the hosting, so it adds no new way in; it is rate-limited, logged,
 *     and should be rotated after use.
 *
 * Challenges live in the store for five minutes and are consumed on first use,
 * so a ceremony cannot be replayed.
 */

import { createHash, randomBytes } from 'node:crypto';
import { sameSecret } from '../http.js';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { record } from './audit.js';

export const SESSION_COOKIE = '__Host-staff';
const CHALLENGE_MS = 5 * 60 * 1000;
const INVITE_HOURS = { enroll: 72, recover: 24 };

export const hash = (value) => createHash('sha256').update(String(value)).digest('base64url');
export const secretToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export { sameSecret };

export class AuthError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.statusCode = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

/* ── People ───────────────────────────────────────────────────────────── */

/**
 * The store follows the operator list in `data/console.js`: new people are added,
 * roles and houses follow the list, and someone no longer listed is disabled and
 * signed out everywhere. Passkeys are kept, so re-listing a person restores them.
 */
export async function syncOperators(store, operators, at = new Date()) {
  return store.update((doc) => {
    const listed = new Set();
    for (const operator of operators) {
      listed.add(operator.id);
      const existing = doc.users[operator.id];
      doc.users[operator.id] = {
        id: operator.id,
        name: operator.name,
        role: operator.role,
        properties: [...operator.properties],
        disabled: false,
        created_at: existing?.created_at ?? at.toISOString(),
        // A stable, random WebAuthn user handle: never the name, never reused.
        handle: existing?.handle ?? secretToken(16),
      };
    }
    for (const user of Object.values(doc.users)) {
      if (listed.has(user.id) || user.disabled) continue;
      user.disabled = true;
      for (const [key, session] of Object.entries(doc.sessions)) if (session.user_id === user.id) delete doc.sessions[key];
      record(doc, { actor: 'system', action: 'user.disabled', target: user.id, at });
    }
    return Object.keys(doc.users).length;
  });
}

const publicUser = (user) => user && ({ id: user.id, name: user.name, role: user.role });

/* ── Rate limits ──────────────────────────────────────────────────────── */

/**
 * Failures per key in a sliding window. In memory on purpose: it protects a
 * running process from guessing, and a restart is not something an attacker gets
 * to trigger from outside.
 */
export function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const failures = new Map();
  const recent = (key) => (failures.get(key) ?? []).filter((t) => now() - t < windowMs);
  return {
    blocked: (key) => recent(key).length >= max,
    fail: (key) => { const list = recent(key); list.push(now()); failures.set(key, list); },
    clear: (key) => failures.delete(key),
  };
}

/* ── The module ───────────────────────────────────────────────────────── */

export function createAuth({ store, config, now = () => Date.now() }) {
  const rp = { rpName: config.name, rpID: config.rpId, origin: config.origin };
  const signInLimiter = createLimiter({ max: 20, windowMs: 15 * 60 * 1000, now });
  const setupLimiter = createLimiter({ max: 5, windowMs: 60 * 60 * 1000, now });
  const inviteLimiter = createLimiter({ max: 20, windowMs: 15 * 60 * 1000, now });
  const iso = (ms = now()) => new Date(ms).toISOString();

  /* Challenges ---------------------------------------------------------- */

  async function keepChallenge(challenge, purpose, extra = {}) {
    await store.update((doc) => {
      for (const [key, entry] of Object.entries(doc.challenges)) {
        if (Date.parse(entry.expires_at) < now()) delete doc.challenges[key];
      }
      doc.challenges[hash(challenge)] = { purpose, ...extra, expires_at: iso(now() + CHALLENGE_MS) };
    });
  }

  /** The challenge the browser signed, taken once: a second use finds nothing. */
  async function takeChallenge(response, purpose) {
    let challenge = '';
    try {
      const clientData = JSON.parse(Buffer.from(String(response?.response?.clientDataJSON ?? ''), 'base64url').toString('utf8'));
      challenge = String(clientData.challenge ?? '');
    } catch { /* malformed: refused below */ }
    if (!challenge) throw new AuthError(400, 'malformed-response');
    const entry = await store.update((doc) => {
      const key = hash(challenge);
      const found = doc.challenges[key];
      delete doc.challenges[key];
      return found ?? null;
    });
    if (!entry || entry.purpose !== purpose || Date.parse(entry.expires_at) < now()) {
      throw new AuthError(400, 'challenge-expired');
    }
    return { challenge, entry };
  }

  /* Sessions ------------------------------------------------------------ */

  function cookie(value, maxAgeSeconds) {
    return [
      `${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict',
      ...(config.secureCookies ? ['Secure'] : []),
      `Max-Age=${maxAgeSeconds}`,
    ].join('; ');
  }

  async function openSession(doc, user, { credentialId, device = '' }) {
    const value = secretToken(32);
    const at = now();
    doc.sessions[hash(value)] = {
      user_id: user.id,
      credential_id: credentialId,
      device: String(device).slice(0, 80),
      created_at: iso(at),
      last_seen_at: iso(at),
      expires_at: iso(at + config.session.absoluteHours * 3600e3),
      verified_at: iso(at),
    };
    return cookie(value, config.session.absoluteHours * 3600);
  }

  const clearCookie = () => cookie('', 0);

  function readCookie(req) {
    const header = String(req.headers.cookie ?? '');
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === SESSION_COOKIE) return rest.join('=');
    }
    return '';
  }

  /** The person behind a request, or null. Touches the session at most every five minutes. */
  async function sessionFor(req) {
    const value = readCookie(req);
    if (!value || value.length > 100) return null;
    const key = hash(value);
    const found = await store.read((doc) => {
      const session = doc.sessions[key];
      if (!session) return null;
      const user = doc.users[session.user_id];
      const credential = doc.credentials[session.credential_id];
      return { session, user, credential };
    });
    if (!found?.user || found.user.disabled) return null;
    const { session } = found;
    const idleLimit = Date.parse(session.last_seen_at) + config.session.idleHours * 3600e3;
    // A session opened by a passkey that has since been revoked ends with it.
    const revoked = session.credential_id && (!found.credential || found.credential.revoked_at);
    if (Date.parse(session.expires_at) < now() || idleLimit < now() || revoked) {
      await store.update((doc) => { delete doc.sessions[key]; });
      return null;
    }
    if (now() - Date.parse(session.last_seen_at) > 5 * 60 * 1000) {
      await store.update((doc) => { if (doc.sessions[key]) doc.sessions[key].last_seen_at = iso(); });
    }
    return { key, user: found.user, session };
  }

  const freshlyVerified = (session) =>
    now() - Date.parse(session.verified_at ?? 0) <= config.session.stepUpMinutes * 60 * 1000;

  async function endSession(key) {
    await store.update((doc) => { delete doc.sessions[key]; });
  }

  /* Registration -------------------------------------------------------- */

  async function registrationOptions(user, existing) {
    const options = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpID,
      userName: user.name,
      userDisplayName: user.name,
      userID: Buffer.from(user.handle, 'base64url'),
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      supportedAlgorithmIDs: [-7, -257],
    });
    return options;
  }

  /**
   * Who is enrolling, and on what authority: an invitation, the setup code, or a
   * signed-in person adding a second device after a fresh passkey check.
   */
  async function enrolOptions({ invite, setupCode, userId, session, ip }) {
    let user;
    let authority;
    if (invite) {
      if (inviteLimiter.blocked(ip)) throw new AuthError(429, 'too-many-attempts');
      const found = await store.read((doc) => {
        const entry = doc.invites[hash(invite)];
        return entry ? { entry, user: doc.users[entry.user_id] } : null;
      });
      if (!found || found.entry.used_at || Date.parse(found.entry.expires_at) < now() || !found.user || found.user.disabled) {
        inviteLimiter.fail(ip);
        throw new AuthError(400, 'invite-invalid');
      }
      user = found.user;
      authority = { kind: 'invite', invite: hash(invite) };
    } else if (setupCode !== undefined) {
      if (setupLimiter.blocked('setup')) throw new AuthError(429, 'too-many-attempts');
      if (!sameSecret(setupCode, config.setupCode)) {
        setupLimiter.fail('setup');
        await store.update((doc) => record(doc, { actor: 'anonymous', action: 'setup.refused', detail: { ip }, at: new Date(now()) }));
        throw new AuthError(403, 'setup-code-invalid');
      }
      // The setup code only ever enrols an owner: it is the owner's way in and
      // the owner's way back, never anybody else's.
      user = await store.read((doc) => {
        const owners = Object.values(doc.users).filter((u) => u.role === 'owner' && !u.disabled);
        return userId ? owners.find((u) => u.id === userId) : owners.length === 1 ? owners[0] : null;
      });
      if (!user) throw new AuthError(400, 'owner-not-found');
      authority = { kind: 'setup' };
    } else if (session) {
      if (!freshlyVerified(session.session)) throw new AuthError(403, 'step-up-required');
      user = session.user;
      authority = { kind: 'session' };
    } else {
      throw new AuthError(401, 'unauthenticated');
    }

    const existing = await store.read((doc) => Object.values(doc.credentials)
      .filter((c) => c.user_id === user.id && !c.revoked_at));
    const options = await registrationOptions(user, existing);
    await keepChallenge(options.challenge, 'register', { user_id: user.id, authority });
    return { options, user: publicUser(user) };
  }

  async function enrolVerify({ response, label = '', device = '', ip }) {
    const { challenge, entry } = await takeChallenge(response, 'register');
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
      });
    } catch (error) {
      throw new AuthError(400, 'registration-refused', { reason: error.message });
    }
    if (!verification.verified) throw new AuthError(400, 'registration-refused');
    const info = verification.registrationInfo;

    return store.update(async (doc) => {
      const user = doc.users[entry.user_id];
      if (!user || user.disabled) throw new AuthError(400, 'user-disabled');
      const { authority } = entry;
      let revokeExisting = false;
      if (authority.kind === 'invite') {
        // Consumed here, in the same write that adds the passkey: two tabs racing
        // the same link get one passkey between them.
        const invite = doc.invites[authority.invite];
        if (!invite || invite.used_at || Date.parse(invite.expires_at) < now()) throw new AuthError(400, 'invite-invalid');
        invite.used_at = iso();
        revokeExisting = Boolean(invite.revoke_existing);
      }
      if (doc.credentials[info.credential.id]) throw new AuthError(409, 'passkey-already-registered');
      if (revokeExisting) {
        for (const credential of Object.values(doc.credentials)) {
          if (credential.user_id === user.id && !credential.revoked_at) credential.revoked_at = iso();
        }
        for (const [key, session] of Object.entries(doc.sessions)) if (session.user_id === user.id) delete doc.sessions[key];
      }
      doc.credentials[info.credential.id] = {
        id: info.credential.id,
        user_id: user.id,
        public_key: Buffer.from(info.credential.publicKey).toString('base64url'),
        counter: info.credential.counter,
        transports: info.credential.transports ?? [],
        device_type: info.credentialDeviceType,
        backed_up: info.credentialBackedUp,
        label: String(label || device || 'Passkey').slice(0, 60),
        created_at: iso(),
        last_used_at: iso(),
        revoked_at: null,
      };
      record(doc, {
        actor: user.id, action: 'passkey.added', target: info.credential.id.slice(0, 12),
        detail: { via: authority.kind, revoked_others: revokeExisting, ip }, at: new Date(now()),
      });
      const setCookie = await openSession(doc, user, { credentialId: info.credential.id, device });
      return { user: publicUser(user), setCookie };
    });
  }

  /* Authentication ------------------------------------------------------ */

  async function signInOptions() {
    const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'required' });
    await keepChallenge(options.challenge, 'sign-in');
    return options;
  }

  async function checkAssertion(response, purpose, { expectUser = null } = {}) {
    const { challenge } = await takeChallenge(response, purpose);
    const id = String(response?.id ?? '');
    const found = await store.read((doc) => {
      const credential = doc.credentials[id];
      return credential ? { credential, user: doc.users[credential.user_id] } : null;
    });
    if (!found || found.credential.revoked_at || !found.user || found.user.disabled) {
      throw new AuthError(401, 'passkey-unknown');
    }
    if (expectUser && found.user.id !== expectUser) throw new AuthError(403, 'passkey-belongs-to-someone-else');
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: {
          id: found.credential.id,
          publicKey: Buffer.from(found.credential.public_key, 'base64url'),
          counter: found.credential.counter,
          transports: found.credential.transports,
        },
        requireUserVerification: true,
      });
    } catch (error) {
      throw new AuthError(401, 'passkey-refused', { reason: error.message });
    }
    if (!verification.verified) throw new AuthError(401, 'passkey-refused');
    return { credential: found.credential, user: found.user, info: verification.authenticationInfo };
  }

  async function signInVerify({ response, device = '', ip }) {
    if (signInLimiter.blocked(ip)) throw new AuthError(429, 'too-many-attempts');
    let result;
    try {
      result = await checkAssertion(response, 'sign-in');
    } catch (error) {
      signInLimiter.fail(ip);
      throw error;
    }
    return store.update(async (doc) => {
      const credential = doc.credentials[result.credential.id];
      credential.counter = result.info.newCounter;
      credential.last_used_at = iso();
      const user = doc.users[result.user.id];
      record(doc, { actor: user.id, action: 'sign-in', detail: { ip, passkey: credential.label }, at: new Date(now()) });
      const setCookie = await openSession(doc, user, { credentialId: credential.id, device });
      return { user: publicUser(user), setCookie };
    });
  }

  async function stepUpOptions(session) {
    const credentials = await store.read((doc) => Object.values(doc.credentials)
      .filter((c) => c.user_id === session.user.id && !c.revoked_at));
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: 'required',
      allowCredentials: credentials.map((c) => ({ id: c.id, transports: c.transports })),
    });
    await keepChallenge(options.challenge, 'step-up', { user_id: session.user.id });
    return options;
  }

  async function stepUpVerify(session, { response }) {
    const result = await checkAssertion(response, 'step-up', { expectUser: session.user.id });
    await store.update((doc) => {
      const credential = doc.credentials[result.credential.id];
      credential.counter = result.info.newCounter;
      credential.last_used_at = iso();
      if (doc.sessions[session.key]) doc.sessions[session.key].verified_at = iso();
    });
    return { ok: true, until: iso(now() + config.session.stepUpMinutes * 60 * 1000) };
  }

  /* Invitations and recovery ------------------------------------------- */

  /**
   * A single-use link for one person: their first passkey (`enroll`), or a new
   * one after losing a phone (`recover`, optionally retiring every passkey they
   * had). The link is returned once, to the owner who asked for it, and only its
   * hash is kept.
   */
  async function createInvite({ by, userId, purpose = 'enroll', revokeExisting = false }) {
    if (!INVITE_HOURS[purpose]) throw new AuthError(400, 'unknown-purpose');
    const value = secretToken(32);
    const expires = iso(now() + INVITE_HOURS[purpose] * 3600e3);
    await store.update((doc) => {
      const user = doc.users[userId];
      if (!user || user.disabled) throw new AuthError(404, 'user-not-found');
      // A new link replaces any older unused one for the same person.
      for (const invite of Object.values(doc.invites)) {
        if (invite.user_id === userId && !invite.used_at) invite.used_at = iso();
      }
      doc.invites[hash(value)] = {
        user_id: userId, purpose, revoke_existing: Boolean(revokeExisting),
        created_by: by.id, created_at: iso(), expires_at: expires, used_at: null,
      };
      record(doc, { actor: by.id, action: `invite.${purpose}`, target: userId, detail: { revoke_existing: Boolean(revokeExisting) }, at: new Date(now()) });
    });
    return { link: `${config.publicUrl}/#invito=${value}`, expires_at: expires };
  }

  async function describeInvite(value, ip) {
    if (inviteLimiter.blocked(ip)) throw new AuthError(429, 'too-many-attempts');
    const found = await store.read((doc) => {
      const entry = doc.invites[hash(value)];
      return entry ? { entry, user: doc.users[entry.user_id] } : null;
    });
    if (!found || found.entry.used_at || Date.parse(found.entry.expires_at) < now() || !found.user || found.user.disabled) {
      inviteLimiter.fail(ip);
      throw new AuthError(400, 'invite-invalid');
    }
    return { user: publicUser(found.user), purpose: found.entry.purpose, expires_at: found.entry.expires_at };
  }

  async function revokePasskey({ by, credentialId, userId }) {
    return store.update((doc) => {
      const credential = doc.credentials[credentialId];
      if (!credential || credential.user_id !== userId) throw new AuthError(404, 'passkey-not-found');
      if (!credential.revoked_at) credential.revoked_at = iso();
      for (const [key, session] of Object.entries(doc.sessions)) {
        if (session.credential_id === credentialId) delete doc.sessions[key];
      }
      record(doc, { actor: by.id, action: 'passkey.revoked', target: `${userId}:${credentialId.slice(0, 12)}`, at: new Date(now()) });
      return { ok: true };
    });
  }

  async function revokeSessions({ by, userId, except = null }) {
    return store.update((doc) => {
      let ended = 0;
      for (const [key, session] of Object.entries(doc.sessions)) {
        if (session.user_id === userId && key !== except) { delete doc.sessions[key]; ended += 1; }
      }
      record(doc, { actor: by.id, action: 'sessions.revoked', target: userId, detail: { ended }, at: new Date(now()) });
      return { ok: true, ended };
    });
  }

  async function passkeysOf(userId) {
    return store.read((doc) => Object.values(doc.credentials)
      .filter((c) => c.user_id === userId && !c.revoked_at)
      .map((c) => ({
        id: c.id, label: c.label, created_at: c.created_at, last_used_at: c.last_used_at,
        synced: Boolean(c.backed_up),
      })));
  }

  return {
    rp,
    clearCookie,
    sessionFor,
    endSession,
    freshlyVerified,
    signInOptions,
    signInVerify,
    stepUpOptions,
    stepUpVerify,
    enrolOptions,
    enrolVerify,
    createInvite,
    describeInvite,
    revokePasskey,
    revokeSessions,
    passkeysOf,
  };
}
