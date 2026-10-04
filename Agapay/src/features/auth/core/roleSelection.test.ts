import { resolveRoleSelectionNextRoute } from '@/src/features/auth/core/roleSelection';

describe('roleSelection', () => {
  it('routes to signin when next=signin', () => {
    expect(resolveRoleSelectionNextRoute('signin')).toBe('/(auth)/signin');
  });

  it('defaults to signup step1 otherwise', () => {
    expect(resolveRoleSelectionNextRoute(undefined)).toBe('/(auth)/signup-step1');
    expect(resolveRoleSelectionNextRoute('signup')).toBe('/(auth)/signup-step1');
    expect(resolveRoleSelectionNextRoute('anything')).toBe('/(auth)/signup-step1');
  });
});
