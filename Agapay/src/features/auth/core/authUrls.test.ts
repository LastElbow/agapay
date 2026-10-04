import { isAuthUrl } from '@/src/features/auth/core/authUrls';

describe('isAuthUrl', () => {
  const baseUrl = 'https://example.com/';
  const skip = new Set<string>(['/api/Auth/refresh', '/api/Auth/login']);

  it('matches relative path', () => {
    expect(isAuthUrl('/api/Auth/refresh', baseUrl, skip)).toBe(true);
    expect(isAuthUrl('/api/Other', baseUrl, skip)).toBe(false);
  });

  it('matches absolute URL by pathname', () => {
    expect(isAuthUrl('https://example.com/api/Auth/login', baseUrl, skip)).toBe(true);
    expect(isAuthUrl('https://example.com/api/Other', baseUrl, skip)).toBe(false);
  });
});
