export type RoleSelectionNextRoute = '/(auth)/signin' | '/(auth)/signup-step1';

export function resolveRoleSelectionNextRoute(
  nextParam?: string
): RoleSelectionNextRoute {
  return nextParam === 'signin' ? '/(auth)/signin' : '/(auth)/signup-step1';
}
