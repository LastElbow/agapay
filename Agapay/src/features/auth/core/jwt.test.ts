import { decodeJwtExp } from '@/src/features/auth/core/jwt';

function base64Url(json: any): string {
  const base64 = Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function makeJwt(payload: any): string {
  const header = base64Url({ alg: 'none', typ: 'JWT' });
  const body = base64Url(payload);
  return `${header}.${body}.sig`;
}

describe('decodeJwtExp', () => {
  it('returns exp when present', () => {
    const token = makeJwt({ exp: 123, sub: 'u' });
    expect(decodeJwtExp(token)).toBe(123);
  });

  it('returns null for null token', () => {
    expect(decodeJwtExp(null)).toBeNull();
  });

  it('returns null for malformed token', () => {
    expect(decodeJwtExp('not-a-jwt')).toBeNull();
  });

  it('returns null when exp missing', () => {
    const token = makeJwt({ sub: 'u' });
    expect(decodeJwtExp(token)).toBeNull();
  });
});
