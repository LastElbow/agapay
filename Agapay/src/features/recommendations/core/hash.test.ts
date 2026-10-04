import { hashPreferences } from '@/src/features/recommendations/core/hash';

describe('hashPreferences', () => {
  it('is deterministic for same logical snapshot', () => {
    const a = hashPreferences('u', { budget: 100, services: ['x'], specializations: ['s'] });
    const b = hashPreferences('u', { services: ['x'], specializations: ['s'], budget: 100 });
    expect(a).toBe(b);
  });

  it('changes when snapshot changes', () => {
    const a = hashPreferences('u', { budget: 100 });
    const b = hashPreferences('u', { budget: 200 });
    expect(a).not.toBe(b);
  });
});
