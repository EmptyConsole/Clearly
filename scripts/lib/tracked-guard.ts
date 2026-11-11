// Pure rules for the tracked-file guard. Used by the pre-commit hook and CI.
// A file is rejected if it is an environment file, looks like a private key,
// or is larger than 5 MB outside assets/demo/.

export const MAX_BYTES = 5 * 1024 * 1024;
export const LARGE_FILE_ALLOWED_PREFIX = 'assets/demo/';

export type Violation = { path: string; reason: string };

const KEY_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx'];
const SSH_KEY_NAMES = new Set(['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519']);
// Matches PEM private-key headers: PKCS8 ("BEGIN PRIVATE KEY"), encrypted PKCS8,
// and the RSA, EC, DSA and OPENSSH variants.
const PRIVATE_KEY_HEADER = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

export function isEnvFile(path: string): boolean {
  const name = basename(path);
  return name === '.env' || name.startsWith('.env.');
}

export function hasKeyFileName(path: string): boolean {
  const name = basename(path).toLowerCase();
  if (SSH_KEY_NAMES.has(name)) return true;
  return KEY_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function containsPrivateKey(content: string): boolean {
  return PRIVATE_KEY_HEADER.test(content);
}

export function checkFile(path: string, size: number, content: string | null): Violation[] {
  const found: Violation[] = [];
  if (isEnvFile(path)) {
    found.push({ path, reason: 'environment file (no .env file may be committed)' });
  }
  if (hasKeyFileName(path)) {
    found.push({ path, reason: 'file name looks like a private key or certificate' });
  }
  if (content !== null && containsPrivateKey(content)) {
    found.push({ path, reason: 'contains a private key header' });
  }
  if (size > MAX_BYTES && !path.startsWith(LARGE_FILE_ALLOWED_PREFIX)) {
    const mb = (size / 1024 / 1024).toFixed(1);
    found.push({
      path,
      reason: `${mb} MB is over the 5 MB limit (only assets/demo/ may hold large files)`,
    });
  }
  return found;
}
