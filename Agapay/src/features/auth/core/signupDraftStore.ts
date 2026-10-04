import type { AuthRole } from './authFlows';

export type SignupDraft = {
  role: AuthRole;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string | null;
  licenseNumber?: string | null;
  workPhoneNumber?: string | null;
};

let draft: SignupDraft | null = null;

export function setSignupDraft(next: SignupDraft): void {
  draft = {
    ...next,
    email: (next.email ?? '').trim(),
  };
}

export function getSignupDraft(email?: string): SignupDraft | null {
  if (!draft) return null;
  if (email && draft.email.toLowerCase() !== email.trim().toLowerCase()) {
    return null;
  }
  return draft;
}

export function clearSignupDraft(): void {
  draft = null;
}
