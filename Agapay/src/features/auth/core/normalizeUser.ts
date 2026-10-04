import type { AuthUser, AuthUserPayload } from "./user";

export type { AuthUser };

export function normalizeAuthUser(user: AuthUser): AuthUser {
  if (!user) return user;

  const first =
    user.firstName ??
    user.FirstName ??
    user.givenName ??
    user.GivenName ??
    user.name ??
    null;
  const last =
    user.lastName ??
    user.LastName ??
    user.familyName ??
    user.FamilyName ??
    null;
  const gender = user.gender ?? user.Gender ?? null;
  const dob = user.dateOfBirth ?? user.DateOfBirth ?? null;

  const normalized: AuthUserPayload = { ...user };

  if (first != null) {
    normalized.firstName = first;
    normalized.FirstName = first;
  }
  if (last != null) {
    normalized.lastName = last;
    normalized.LastName = last;
  }
  if (gender != null) {
    normalized.gender = gender;
    normalized.Gender = gender;
  }
  if (dob != null) {
    normalized.dateOfBirth = dob;
    normalized.DateOfBirth = dob;
  }

  return normalized;
}
