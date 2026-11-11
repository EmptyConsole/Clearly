import { describe, expect, it } from 'vitest';
import {
  checkFile,
  containsPrivateKey,
  hasKeyFileName,
  isEnvFile,
  MAX_BYTES,
} from './tracked-guard.ts';

// Built by concatenation so this test file never contains a real-looking header.
const header = (kind: string) => '-----BEGIN ' + kind + 'PRIVATE KEY-----';

describe('tracked-file guard', () => {
  it('rejects every environment file, .env.example included', () => {
    expect(isEnvFile('.env')).toBe(true);
    expect(isEnvFile('apps/server/.env.production')).toBe(true);
    expect(isEnvFile('.env.example')).toBe(true);
    expect(isEnvFile('apps/web/src/environment.ts')).toBe(false);
  });

  it('rejects key file names', () => {
    expect(hasKeyFileName('certs/server.pem')).toBe(true);
    expect(hasKeyFileName('x/signing.key')).toBe(true);
    expect(hasKeyFileName('home/id_rsa')).toBe(true);
    expect(hasKeyFileName('home/id_rsa.pub')).toBe(false);
    expect(hasKeyFileName('src/keyboard.ts')).toBe(false);
  });

  it('detects PKCS8, encrypted PKCS8, RSA and OpenSSH private key headers', () => {
    expect(containsPrivateKey(`x\n${header('')}\nabc`)).toBe(true);
    expect(containsPrivateKey(header('ENCRYPTED '))).toBe(true);
    expect(containsPrivateKey(header('RSA '))).toBe(true);
    expect(containsPrivateKey(header('OPENSSH '))).toBe(true);
    expect(containsPrivateKey('-----BEGIN PUBLIC KEY-----')).toBe(false);
  });

  it('enforces the 5 MB limit except under assets/demo/', () => {
    expect(checkFile('big.wav', MAX_BYTES + 1, null)).toHaveLength(1);
    expect(checkFile('assets/demo/clip.wav', MAX_BYTES + 1, null)).toHaveLength(0);
    expect(checkFile('ok.wav', MAX_BYTES, null)).toHaveLength(0);
  });

  it('passes an ordinary source file', () => {
    expect(checkFile('packages/core/src/index.ts', 120, 'export {};')).toEqual([]);
  });
});
