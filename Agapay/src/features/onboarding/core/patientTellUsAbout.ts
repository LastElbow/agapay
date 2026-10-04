import { formatMissingFieldsList } from '@/src/features/onboarding/core/missingFields';

export type PatientActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | '';

type TellUsAboutInput = {
  address: string;
  occupation: string;
  activityLevel: PatientActivityLevel;
};

type TellUsAboutOk = {
  ok: true;
  address: string;
  occupation: string;
  activityLevel: Exclude<PatientActivityLevel, ''>;
};

type TellUsAboutErr = {
  ok: false;
  title: 'Missing Information';
  message: string;
  missingFields: string[];
};

export function validatePatientTellUsAboutForm(input: TellUsAboutInput): TellUsAboutOk | TellUsAboutErr {
  const address = input.address ?? '';
  const occupationTrimmed = (input.occupation ?? '').trim();
  const activityLevel = input.activityLevel ?? '';

  const missingFields: string[] = [];
  if (!address || address.trim().length === 0) missingFields.push('Address');
  if (!occupationTrimmed) missingFields.push('Occupation');
  if (!activityLevel) missingFields.push('Activity Level');

  if (missingFields.length > 0) {
    const fieldsList = formatMissingFieldsList(missingFields);
    return {
      ok: false,
      title: 'Missing Information',
      message: `Please fill in ${fieldsList}.`,
      missingFields,
    };
  }

  return {
    ok: true,
    address,
    occupation: occupationTrimmed,
    activityLevel: activityLevel as Exclude<PatientActivityLevel, ''>,
  };
}

type AddressPickContext = {
  address?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  barangayId?: number | null;
  barangayName?: string | null;
  locationDisplayName?: string | null;
};

// Matches current UI logic: suppress store fallback only when *everything* is falsy.
export function shouldSuppressStoreFallbackOnAddressPick(ctx: AddressPickContext): boolean {
  const addr = ctx.address ?? '';
  const lat = ctx.latitude ?? '';
  const lng = ctx.longitude ?? '';
  const barangayId = ctx.barangayId ?? null;
  const barangayName = ctx.barangayName ?? '';
  const locName = ctx.locationDisplayName ?? '';

  return !addr && !lat && !lng && !barangayId && !barangayName && !locName;
}
