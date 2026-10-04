export type AuthUserLike = {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
} | null | undefined;

export type PatientOnboardingParamsLike = {
  address?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  locationDisplayName?: string | null;
  occupation?: string | null;
  activityLevel?: string | null;
} | null | undefined;

export type PatientOnboardingPayload = {
  onboardingType: 'ForMyself';
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  relationshipToUser: 'myself';
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  locationDisplayName: string | null;
  occupation: string | null;
  currentComplaints: string | null;
  activityLevel: string | null;
  gender: string | null;
};

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function buildPatientOnboardingPayloadForMyself(args: {
  authUser: AuthUserLike;
  params: PatientOnboardingParamsLike;
  currentComplaints: string;
}): PatientOnboardingPayload {
  const authUser = args.authUser ?? null;
  const params = args.params ?? null;

  return {
    onboardingType: 'ForMyself',
    firstName: authUser?.firstName || null,
    lastName: authUser?.lastName || null,
    dateOfBirth: authUser?.dateOfBirth || null,
    relationshipToUser: 'myself',
    address: (params?.address as string) || null,
    latitude: parseOptionalNumber(params?.latitude),
    longitude: parseOptionalNumber(params?.longitude),
    locationDisplayName: (params?.locationDisplayName as string) || null,
    occupation: (params?.occupation as string) || null,
    currentComplaints: args.currentComplaints.trim() || null,
    activityLevel: (params?.activityLevel as string) || null,
    gender: authUser?.gender || null,
  };
}
