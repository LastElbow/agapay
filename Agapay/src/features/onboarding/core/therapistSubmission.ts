export type TherapistOnboardingSnapshot = {
  profilePicture?: string | null;
  specializationIds?: number[] | null;
  feePerSession?: number | null;
  conditionIds?: number[] | null;
  otherConditions?: string[] | null;
  otherCondition?: string | null;
  serviceAreaIds?: number[] | null;
};

export type TherapistMultipartField = { name: string; value: string };
export type TherapistFilePart = { uri: string; name: string; type: string };

type Step4Ok = { ok: true; serviceAreaIds: number[] };
type Step4Err = { ok: false; error: string };

function uniqueNumbers(ids: number[]): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (typeof id === 'number' && Number.isFinite(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function validateTherapistServiceAreasStep(serviceAreaIds: number[] | null | undefined): Step4Ok | Step4Err {
  const normalized = uniqueNumbers(serviceAreaIds ?? []);
  if (normalized.length === 0) {
    return { ok: false, error: 'Please select at least one service area.' };
  }
  return { ok: true, serviceAreaIds: normalized };
}

export function getProfilePictureFilePart(uri: string): TherapistFilePart {
  const parts = uri.split('/');
  const filename = parts[parts.length - 1] || 'photo.jpg';
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  return {
    uri,
    name: filename,
    type: mimeType,
  };
}

export function buildTherapistOnboardingMultipartParts(snapshot: TherapistOnboardingSnapshot): {
  fields: TherapistMultipartField[];
  file?: TherapistFilePart;
} {
  const fields: TherapistMultipartField[] = [];

  if (snapshot.feePerSession != null) {
    fields.push({ name: 'FeePerSession', value: String(snapshot.feePerSession) });
  }

  for (const id of uniqueNumbers(snapshot.specializationIds ?? [])) {
    fields.push({ name: 'SpecializationIds', value: String(id) });
  }

  for (const id of uniqueNumbers(snapshot.conditionIds ?? [])) {
    fields.push({ name: 'ConditionIds', value: String(id) });
  }

  const otherConditions = (snapshot.otherConditions ?? [])
    .map((c) => String(c ?? '').trim())
    .filter(Boolean);

  if (otherConditions.length > 0) {
    for (const c of otherConditions) {
      fields.push({ name: 'OtherConditionsList', value: c });
    }
  } else {
    const legacy = String(snapshot.otherCondition ?? '').trim();
    if (legacy) {
      fields.push({ name: 'OtherCondition', value: legacy });
    }
  }

  for (const id of uniqueNumbers(snapshot.serviceAreaIds ?? [])) {
    fields.push({ name: 'ServiceAreasIds', value: String(id) });
  }

  const uri = snapshot.profilePicture;
  const file = uri ? getProfilePictureFilePart(uri) : undefined;

  return { fields, file };
}

export function joinBaseUrl(baseUrl: string | null | undefined, path: string): string {
  const base = baseUrl ?? '';
  const cleanedPath = path.startsWith('/') ? path : `/${path}`;

  if (!base) return cleanedPath;
  if (base.endsWith('/')) return `${base}${cleanedPath.slice(1)}`;
  return `${base}${cleanedPath}`;
}
