/**
 * Cross-environment UTF-8 safe Base64 encoder and decoder.
 * Supports both browser / Chrome extension context and Node / Vitest test runners.
 */

export function toBase64(text: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf-8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(text)));
}

export function fromBase64(b64: string): string {
  const cleaned = b64.replace(/\s/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(cleaned, 'base64').toString('utf-8');
  }
  return decodeURIComponent(escape(atob(cleaned)));
}
