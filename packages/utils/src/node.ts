import { X509Certificate } from 'node:crypto';

const PEM_CERTIFICATE =
  /^\s*-----BEGIN CERTIFICATE-----[\r\n]+[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/;

/** True when `ca` is a single PEM-encoded CA certificate within 64 KiB. */
export function isValidCaPem(ca: string): boolean {
  if (Buffer.byteLength(ca) > 65536 || !PEM_CERTIFICATE.test(ca)) return false;
  try {
    return new X509Certificate(ca).ca;
  } catch {
    return false;
  }
}
