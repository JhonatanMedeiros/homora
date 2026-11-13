import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

type Options = { challenge: string; rp?: { id?: string } };

/**
 * A software WebAuthn authenticator (ES256, `none` attestation) for API tests, standing in for a
 * browser's virtual authenticator. Each flag can be bent to prove the server refuses it.
 */
export function createVirtualAuthenticator({
  origin = 'http://localhost:5173',
  rpId = 'localhost',
}: { origin?: string; rpId?: string } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(32);
  const id = isoBase64URL.fromBuffer(credentialId);
  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, isoBase64URL.toBuffer(jwk.x!)],
      [-3, isoBase64URL.toBuffer(jwk.y!)],
    ]),
  );
  const hash = (data: Uint8Array | string) => createHash('sha256').update(data).digest();
  const clientData = (type: string, challenge: string, claimedOrigin: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin: claimedOrigin, crossOrigin: false }));
  const counter = (value: number) => {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(value);
    return bytes;
  };
  const USER_PRESENT = 0x01;
  const USER_VERIFIED = 0x04;
  const ATTESTED = 0x40;

  return {
    id,
    /** The registration response for options from `generate-register-options`. */
    register(options: Options, { verified = true, claimedOrigin = origin, rpIdHash = rpId } = {}) {
      const credentialIdLength = Buffer.alloc(2);
      credentialIdLength.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([
        hash(rpIdHash),
        Buffer.from([USER_PRESENT | (verified ? USER_VERIFIED : 0) | ATTESTED]),
        counter(0),
        Buffer.alloc(16),
        credentialIdLength,
        credentialId,
        Buffer.from(cose),
      ]);
      const attestationObject = isoCBOR.encode(
        new Map<string, unknown>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', new Uint8Array(authData)],
        ]) as Parameters<typeof isoCBOR.encode>[0],
      );
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(
            clientData('webauthn.create', options.challenge, claimedOrigin),
          ),
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
    /** The assertion for options from `generate-authenticate-options`. */
    assert(
      options: Options,
      {
        verified = true,
        claimedOrigin = origin,
        rpIdHash = rpId,
        challenge = options.challenge,
        signCount = 1,
        credential = id,
      } = {},
    ) {
      const authData = Buffer.concat([
        hash(rpIdHash),
        Buffer.from([USER_PRESENT | (verified ? USER_VERIFIED : 0)]),
        counter(signCount),
      ]);
      const clientDataJSON = clientData('webauthn.get', challenge, claimedOrigin);
      const signature = sign('sha256', Buffer.concat([authData, hash(clientDataJSON)]), privateKey);
      return {
        id: credential,
        rawId: credential,
        type: 'public-key',
        response: {
          authenticatorData: isoBase64URL.fromBuffer(authData),
          clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
          signature: isoBase64URL.fromBuffer(signature),
        },
        clientExtensionResults: {},
      };
    },
  };
}
