import net from 'node:net';
import tls from 'node:tls';

const TIMEOUT_MS = 5000;

/** Opens and closes a TCP connection to an already authorized address; resolves with the time it took. */
export function tcpConnect(address: string, port: number, timeoutMs = TIMEOUT_MS): Promise<number> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const socket = net.connect({ host: address, port, timeout: timeoutMs });
    const done = (error?: Error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve(Date.now() - startedAt);
    };
    socket.once('connect', () => done());
    socket.once('timeout', () => done(new Error('Timeout exceeded.')));
    socket.once('error', () => done(new Error('Connection failed.')));
  });
}

export type Certificate = {
  /** Expiry as epoch milliseconds. */
  validTo: number;
  /** The chain is trusted and matches the host name. */
  authorized: boolean;
  /** OpenSSL's name for why it is not, such as `CERT_HAS_EXPIRED`. */
  error: string | null;
  latencyMs: number;
};

/**
 * Reads the certificate a server presents at an already authorized address. The handshake is
 * not aborted on an invalid chain, so an expired or self-signed certificate can be reported
 * as such instead of as a generic failure. Nothing is sent after the handshake.
 */
export function readCertificate(
  address: string,
  hostname: string,
  port: number,
  timeoutMs = TIMEOUT_MS,
): Promise<Certificate> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const socket = tls.connect({
      host: address,
      port,
      servername: net.isIP(hostname) ? undefined : hostname,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });
    const fail = () => {
      socket.destroy();
      reject(new Error('Connection failed.'));
    };
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      const validTo = Date.parse(certificate?.valid_to ?? '');
      const error = socket.authorizationError ? String(socket.authorizationError) : null;
      const authorized = socket.authorized;
      socket.destroy();
      if (Number.isNaN(validTo)) reject(new Error('No certificate.'));
      else resolve({ validTo, authorized, error, latencyMs: Date.now() - startedAt });
    });
    socket.once('timeout', fail);
    socket.once('error', fail);
  });
}
