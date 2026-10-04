// Shape of the authenticated-user payload the UI reads. The backend emits
// camelCase JSON, but sessions persisted earlier (and a few legacy surfaces)
// still carry PascalCase or snake_case keys, so consumers fall back across
// casings. Keys not listed here remain accessible via the index signature.
export type AuthUserPayload = {
  id?: number | string;
  userId?: number | string;
  _id?: number | string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  avatar?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  barangay?: string | null;
  address?: string | null;
  isPatientOnboardingComplete?: boolean;
  IsPatientOnboardingComplete?: boolean;
  isTherapistOnboardingComplete?: boolean;
  IsTherapistOnboardingComplete?: boolean;
  therapistVerificationStatus?: string | null;
  TherapistVerificationStatus?: string | null;
  therapistId?: number | string | null;
  physicalTherapistId?: number | string | null;
  physicalTherapist?: { id?: number | string } | null;
  roles?: string[];
  Roles?: string[];
  preferredRole?: string | null;
  PreferredRole?: string | null;
  [key: string]: any;
};

export type AuthUser = AuthUserPayload | null;
