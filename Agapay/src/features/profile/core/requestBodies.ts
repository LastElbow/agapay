function normalizeDateOnlyInput(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // Already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // mm/dd/yyyy or mm-dd-yyyy
  const mdY = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (mdY) {
    const [, mm, dd, yyyy] = mdY;
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().slice(0, 10);
  }

  return '';
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeGenderValue(input?: unknown): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower === 'm' || lower === 'male' || lower === '1') return 'Male';
  if (lower === 'f' || lower === 'female' || lower === '0') return 'Female';
  return trimmed;
}

function idsFromObjects(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((item) => (item && typeof item === 'object' ? (item as any).id : undefined))
    .filter((id) => typeof id === 'number' && Number.isFinite(id)) as number[];
  return ids;
}

export function buildUpdatePatientProfileBody(input: {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | Date | null;
  relationshipToUser?: string | null;
  gender?: string | null;
  occupation?: string | null;
  activityLevel?: string | null;
  currentComplaints?: string | null;
  address?: string | null;
  barangay?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const firstName = normalizeOptionalString(input.firstName);
  if (firstName) body.firstName = firstName;

  const lastName = normalizeOptionalString(input.lastName);
  if (lastName) body.lastName = lastName;

  if (input.dateOfBirth instanceof Date) {
    const iso = input.dateOfBirth.toISOString().slice(0, 10);
    if (iso) body.dateOfBirth = iso;
  } else if (typeof input.dateOfBirth === 'string') {
    const normalized = normalizeDateOnlyInput(input.dateOfBirth);
    if (normalized) body.dateOfBirth = normalized;
  }

  const relationship = normalizeOptionalString(input.relationshipToUser);
  if (relationship) body.relationshipToUser = relationship;

  // PatientController: if Gender is not null, it will set/clear.
  if (input.gender !== undefined) {
    body.gender = normalizeGenderValue(input.gender);
  }

  if (input.occupation !== undefined) {
    const v = normalizeOptionalString(input.occupation);
    body.occupation = v;
  }

  if (input.activityLevel !== undefined) {
    const v = normalizeOptionalString(input.activityLevel);
    body.activityLevel = v;
  }

  if (input.currentComplaints !== undefined) {
    const v = normalizeOptionalString(input.currentComplaints);
    body.currentComplaints = v;
  }

  if (input.address !== undefined) {
    const v = normalizeOptionalString(input.address);
    body.address = v;
  }

  if (input.barangay !== undefined) {
    const v = normalizeOptionalString(input.barangay);
    body.barangay = v;
  }

  if (typeof input.latitude === 'number' && Number.isFinite(input.latitude)) {
    body.latitude = input.latitude;
  }

  if (typeof input.longitude === 'number' && Number.isFinite(input.longitude)) {
    body.longitude = input.longitude;
  }

  return body;
}

export function buildUpdateTherapistProfileBody(input: {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | Date | null;
  gender?: string | null;
  feePerSession?: number | string | null;
  otherConditions?: string | null;

  specializationIds?: number[] | null;
  conditionIds?: number[] | null;
  serviceAreasIds?: number[] | null;

  // Legacy shapes still present in some screens
  specializations?: { id: number }[] | null;
  conditions?: { id: number }[] | null;
  serviceAreas?: { id: number }[] | null;
  serviceAreaIds?: number[] | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const firstName = normalizeOptionalString(input.firstName);
  if (firstName) body.firstName = firstName;

  const lastName = normalizeOptionalString(input.lastName);
  if (lastName) body.lastName = lastName;

  if (input.dateOfBirth instanceof Date) {
    const iso = input.dateOfBirth.toISOString().slice(0, 10);
    if (iso) body.dateOfBirth = iso;
  } else if (typeof input.dateOfBirth === 'string') {
    const normalized = normalizeDateOnlyInput(input.dateOfBirth);
    if (normalized) body.dateOfBirth = normalized;
  }

  if (input.gender !== undefined) {
    const g = normalizeGenderValue(input.gender);
    if (g) body.gender = g;
  }

  if (input.feePerSession !== undefined && input.feePerSession !== null) {
    const fee = typeof input.feePerSession === 'string' ? Number(input.feePerSession) : input.feePerSession;
    if (typeof fee === 'number' && Number.isFinite(fee)) body.feePerSession = fee;
  }

  if (input.otherConditions !== undefined) {
    const other = normalizeOptionalString(input.otherConditions);
    // Backend explicitly distinguishes null vs empty; send null to clear.
    body.otherConditions = other;
  }

  const specializationIds =
    Array.isArray(input.specializationIds)
      ? input.specializationIds
      : idsFromObjects(input.specializations);
  if (specializationIds) body.specializationIds = specializationIds;

  const conditionIds =
    Array.isArray(input.conditionIds)
      ? input.conditionIds
      : idsFromObjects(input.conditions);
  if (conditionIds) body.conditionIds = conditionIds;

  const serviceAreasIds =
    Array.isArray(input.serviceAreasIds)
      ? input.serviceAreasIds
      : Array.isArray(input.serviceAreaIds)
        ? input.serviceAreaIds
        : idsFromObjects(input.serviceAreas);
  if (serviceAreasIds) body.serviceAreasIds = serviceAreasIds;

  return body;
}
