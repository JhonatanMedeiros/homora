/** `host`, `host:port` or `host/path` typed without a scheme; anything with spaces is not an address. */
const BARE_ADDRESS =
  /^(\[[\da-f:]+\]|localhost|[\p{L}\d-]+(\.[\p{L}\d-]+)+)(:\d{1,5})?([/?#]\S*)?$/iu;
/** A single name with a port, such as `nas:8096`. */
const HOST_AND_PORT = /^[\p{L}\d-]+:\d{1,5}([/?#]\S*)?$/u;

/** Adds `http://` to an address typed without a scheme, which is how most people write one. */
export function completeAddress(value: string): string {
  const trimmed = value.trim();
  return BARE_ADDRESS.test(trimmed) || HOST_AND_PORT.test(trimmed) ? `http://${trimmed}` : trimmed;
}

/** Whether the server will accept the address: http or https, without embedded credentials. */
export function isServiceAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
