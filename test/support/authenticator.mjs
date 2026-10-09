/**
 * A software passkey, for tests only.
 *
 * Produces exactly what a phone's authenticator hands the browser — an ES256 key
 * pair, a `none` attestation, signed assertions — so the console's sign-in can be
 * tested end to end against the real verifier (@simplewebauthn/server) without a
 * browser. The CBOR writer below covers the handful of types WebAuthn uses.
 */

import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const b64url = (buffer) => Buffer.from(buffer).toString('base64url');
const sha256 = (data) => createHash('sha256').update(data).digest();

/* Minimal CBOR: unsigned/negative integers, byte and text strings, maps. */
function head(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  if (length < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(length, 1); return b; }
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(length, 1); return b;
}

export function cbor(value) {
  if (Number.isInteger(value)) return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.concat([head(2, value.length), Buffer.from(value)]);
  if (typeof value === 'string') { const text = Buffer.from(value, 'utf8'); return Buffer.concat([head(3, text.length), text]); }
  if (value instanceof Map) {
    return Buffer.concat([head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
  }
  if (value && typeof value === 'object') return cbor(new Map(Object.entries(value)));
  throw new Error(`cbor: unsupported ${typeof value}`);
}

const FLAGS = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40 };

/**
 * One authenticator holding one credential. `origin` and `rpId` are what a browser
 * would use; pass a different origin to play a phishing page.
 */
export function createAuthenticator({ origin, rpId, userVerified = true } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(16);
  let counter = 0;
  let userHandle = null;

  const cose = cbor(new Map([
    [1, 2], [3, -7], [-1, 1],
    [-2, Buffer.from(jwk.x, 'base64url')],
    [-3, Buffer.from(jwk.y, 'base64url')],
  ]));

  const flags = (extra = 0) => (FLAGS.UP | (userVerified ? FLAGS.UV : 0) | FLAGS.BE | FLAGS.BS | extra);
  const clientData = (type, challenge, at = origin) => Buffer.from(JSON.stringify({ type, challenge, origin: at, crossOrigin: false }));

  return {
    id: b64url(credentialId),

    /** The answer to `navigator.credentials.create(options)`. */
    register(options, { origin: at = origin } = {}) {
      userHandle = options.user.id;
      const authData = Buffer.concat([
        sha256(rpId), Buffer.from([flags(FLAGS.AT)]), Buffer.alloc(4),
        Buffer.alloc(16), Buffer.from([0, credentialId.length]), credentialId, cose,
      ]);
      const attestationObject = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: 'public-key',
        response: {
          clientDataJSON: b64url(clientData('webauthn.create', options.challenge, at)),
          attestationObject: b64url(attestationObject),
          transports: ['internal', 'hybrid'],
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },

    /** The answer to `navigator.credentials.get(options)`. */
    assert(options, { origin: at = origin } = {}) {
      counter += 1;
      const counterBytes = Buffer.alloc(4);
      counterBytes.writeUInt32BE(counter);
      const authenticatorData = Buffer.concat([sha256(rpId), Buffer.from([flags()]), counterBytes]);
      const clientDataJSON = clientData('webauthn.get', options.challenge, at);
      const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), privateKey);
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: 'public-key',
        response: {
          clientDataJSON: b64url(clientDataJSON),
          authenticatorData: b64url(authenticatorData),
          signature: b64url(signature),
          userHandle,
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
  };
}
