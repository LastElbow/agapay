import { normalizeAuthUser } from '@/src/features/auth/core/normalizeUser';

describe('normalizeAuthUser', () => {
  it('returns null as-is', () => {
    expect(normalizeAuthUser(null)).toBeNull();
  });

  it('normalizes FirstName/LastName and mirrors camel + Pascal fields', () => {
    const input = { FirstName: 'Jane', LastName: 'Doe' };
    const out = normalizeAuthUser(input) as any;

    expect(out.firstName).toBe('Jane');
    expect(out.FirstName).toBe('Jane');
    expect(out.lastName).toBe('Doe');
    expect(out.LastName).toBe('Doe');
  });

  it('prefers existing camelCase fields when present', () => {
    const input = { firstName: 'Alice', FirstName: 'Ignored', lastName: 'Smith' };
    const out = normalizeAuthUser(input) as any;

    expect(out.firstName).toBe('Alice');
    expect(out.FirstName).toBe('Alice');
    expect(out.lastName).toBe('Smith');
  });

  it('normalizes gender and dateOfBirth variants', () => {
    const input = { Gender: 'Female', DateOfBirth: '2000-01-01' };
    const out = normalizeAuthUser(input) as any;

    expect(out.gender).toBe('Female');
    expect(out.Gender).toBe('Female');
    expect(out.dateOfBirth).toBe('2000-01-01');
    expect(out.DateOfBirth).toBe('2000-01-01');
  });
});
